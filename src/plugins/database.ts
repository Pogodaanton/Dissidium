/* eslint-disable @typescript-eslint/no-empty-function */
import { staticImplements, IDissidiumPluginClass } from "../types/DissidiumPlugin";

@staticImplements<IDissidiumPluginClass>()
export default class DatabasePlugin {
  static pluginName = "database";
  static dependencies = [];

  start = async () => {};
  stop = async () => {};
}
