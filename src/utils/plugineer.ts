import { Client, Collection } from "discord.js";
import {
  DissidiumPlugin,
  IDissidiumPluginClass,
  isPluginClass,
} from "../types/DissidiumPlugin";
import fs from "fs/promises";
import path from "path";
import { DissidiumConfig } from "../types/Dissidium";

/**
 * Generates an empty plugin instance that can be used to reserve a plugin spot
 */
const createDummyPlugin = (pluginName: string) => ({
  dependencies: [],
  pluginName,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  start: async () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  stop: async () => {},
});

const pluginsAllowedToUsePlugineer = ["commandInteraction"];

export default class Plugineer {
  /**
   * List of fully initialised plugins
   */
  plugins = new Collection<string, DissidiumPlugin>();

  /**
   * List of plugins waiting to be initialized.
   * A plugin may lie here if it has dependencies yet to resolve.
   */
  uninitializedPlugins = new Collection<string, IDissidiumPluginClass>();

  /**
   * List of uninitialized plugins which are dependencies to a list of other plugins.
   * Each key in this collection represents a plugin which, if loaded, might have to load the plugins listed in its value array, as they depend on it.
   *
   * This dataset should be kept in sync with `Plugineer.dependees`.
   */
  private dependencies = new Collection<string, string[]>();

  /**
   * List of uninitialized plugins waiting for a list of dependencies to load first.
   * Each key in this collection represents a plugin which first needs all other plugins listed in its value array to load first.
   *
   * This dataset should be kept in sync with `Plugineer.dependencies`.
   */
  private dependees = new Collection<string, string[]>();

  /**
   * Queue structure used to store newly loaded plugins which might have other plugins depending on them
   */
  private resolverQueue: string[] = [];

  /**
   * Recursively attempts to resolve plugins depending on newly loaded plugins found in `Plugineer.resolverQueue`
   */
  private resolveDependencies = async () => {
    while (this.resolverQueue.length > 0) {
      const resolvable = this.resolverQueue.shift() ?? "";
      await this.resolveDependees(resolvable);
    }
  };

  /**
   * Finds all plugins which depend on a newly loaded plugin and attempts to load them, too
   * @param pluginName The plugin to find dependees to
   */
  private resolveDependees = async (pluginName: string) => {
    // Check for plugins waiting for this dependency to load
    const pendingPlugins = this.dependencies.get(pluginName);
    if (!pendingPlugins) return;

    // Iterate through each dependee and check whether its dependencies are resolved
    for (const dependeeName of pendingPlugins) {
      // Remove dependency from list of unresolved dependencies this plugin is waiting for
      const unresolvedDeps = this.dependees.get(dependeeName);
      if (!unresolvedDeps) continue;
      const idx = unresolvedDeps.indexOf(pluginName);
      delete unresolvedDeps[idx];

      // If there are some unresolved dependencies left, the plugin continues waiting
      if (unresolvedDeps.length > 0) {
        this.dependees.set(dependeeName, unresolvedDeps);
        continue;
      }

      // Otherwise, all dependencies are resolved for the given plugin and it can be loaded
      this.dependees.delete(dependeeName);

      // Load plugin
      const loadablePlugin = this.uninitializedPlugins.get(dependeeName);
      if (!loadablePlugin) {
        console.log(
          `Plugin named "${dependeeName}" cannot be initialised: Object lost during dependency waiting`
        );
        continue;
      }

      this.uninitializedPlugins.delete(dependeeName);
      const pluginObj = this.initializePlugin(loadablePlugin);
      this.plugins.set(dependeeName, pluginObj);

      // Wait for plugin to start up
      await pluginObj.start();

      // Other plugins might depend on this one
      this.resolverQueue.push(dependeeName);
    }

    this.dependencies.delete(pluginName);
  };

  /**
   * Attempts to load all external JS module files in a directory. On success, the instantiated plugins can be found in `Plugineer.plugins`.
   * @param pluginDirPath The folder path to scan; All JavaScript files in here will be interpreted as plugins. Sub-directories are not read.
   */
  loadPlugins = async (pluginDirPath = "./plugins/") => {
    const files = await fs.readdir(path.resolve(__dirname, pluginDirPath));
    const pluginFileNames = files.filter(file => file.endsWith(".js"));

    const pluginsFound: string[] = [];
    for (const fileName of pluginFileNames) {
      const {
        default: { default: plugin },
      } = await import(`${pluginDirPath}${fileName}`);

      if (!isPluginClass(plugin)) {
        console.log(
          `Unknown plugin file named "${fileName}". Please use "@staticImplements<IDissidiumPluginClass>()" annotation to implement a plugin.`
        );
        continue;
      }

      if (this.plugins.has(plugin.pluginName)) {
        console.log(
          `Can't load plugin file named "${fileName}": There already exists a plugin with the same name.`
        );
        continue;
      }

      const openDependencies = [];
      for (const depName of plugin.dependencies) {
        if (depName === plugin.pluginName) {
          console.log(
            `Warning: Plugin file named "${fileName}" has itself as a dependency.`
          );
          continue;
        }
        // If the dependency is already loaded, we don't have to furlough loading
        if (this.plugins.has(depName)) continue;

        const dependencyArr = this.dependencies.ensure(depName, () => []);
        dependencyArr.push(plugin.pluginName);
        console.log(this.dependencies.get(depName));
        this.dependencies.set(depName, dependencyArr);
        openDependencies.push(depName);
      }

      pluginsFound.push(plugin.pluginName);

      if (openDependencies.length > 0) {
        this.dependees.set(plugin.pluginName, openDependencies);
        this.uninitializedPlugins.set(plugin.pluginName, plugin);
      } else {
        // Dumb re-typing, as we need the static variables in objects, too.
        const pluginObj = this.initializePlugin(plugin);
        this.plugins.set(plugin.pluginName, pluginObj);
        this.resolverQueue.push(plugin.pluginName);

        // Wait for startup to finish
        await pluginObj.start();

        // Start resolve queue
        await this.resolveDependencies();
      }
    }

    return pluginsFound;
  };

  /**
   * Initializes a plugin by injecting its dependencies in the constructor.
   *
   * @param uninitializedPlugin A plugin class to initialize
   * @returns Initialized instance of a plugin
   */
  private initializePlugin = (uninitializedPlugin: IDissidiumPluginClass) => {
    const deps = uninitializedPlugin.dependencies;
    const constructorParams = [];

    for (const depName of deps) {
      if (depName === "client") {
        constructorParams.push(this.client);
        continue;
      } else if (depName === "config") {
        constructorParams.push(this.config);
        continue;
      } else if (
        depName === "plugineer" &&
        pluginsAllowedToUsePlugineer.indexOf(uninitializedPlugin.pluginName) > -1
      ) {
        constructorParams.push(this);
        continue;
      }

      // Add dependency object to inject into the plugin
      const dependency = this.plugins.get(depName);
      if (!dependency)
        throw new Error(
          `Unresolved dependency found for "${uninitializedPlugin.pluginName}". The plugin "${depName}" should have been initialized beforehand.`
        );
      constructorParams.push(dependency);
    }

    return new uninitializedPlugin(...constructorParams) as DissidiumPlugin;
  };

  /**
   * Plugineer manages external plugin loading and plugin-side dependency-injection.
   * The objects in the parameters are used for passing over some data to the plugins, if necessary.
   *
   * @param client An client instance from discord.js
   * @param config A bot configuration object
   */
  constructor(private client: Client<boolean>, private config: DissidiumConfig) {
    // Reserve client, plugineer and config namespaces
    this.plugins.set("client", createDummyPlugin("client"));
    this.plugins.set("config", createDummyPlugin("config"));
    this.plugins.set("plugineer", createDummyPlugin("plugineer"));

    /*
    // The constructor is used to create observers for plugin addition and removal in the main plugin list
    // (Re-)Start plugin, if `Plugineer.plugins.set` is called
    this.plugins.set = (
      key: string,
      value: DissidiumPlugin
    ): Collection<string, DissidiumPlugin> => {
      const oldVal = this.plugins.get(key);
      if (oldVal) oldVal.stop();

      value.start();
      Map.prototype.set.call(this.plugins, key, value);

      return this.plugins;
    };

    // Stop plugin before deleting it from the collection
    this.plugins.delete = (key: string): boolean => {
      const oldVal = this.plugins.get(key);
      if (oldVal) oldVal.stop();

      return Map.prototype.delete.call(this.plugins, key);
    };
    */
  }
}
