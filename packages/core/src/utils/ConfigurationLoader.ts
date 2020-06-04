import { pathExists } from 'fs-extra';
import path from 'path';
import { IDatabaseDriver } from '../drivers';
import { Configuration } from './Configuration';
import { Utils } from './Utils';
import { Dictionary } from '../typings';

export class ConfigurationLoader {

  static async getConfiguration<D extends IDatabaseDriver = IDatabaseDriver>(validate = true, options: Partial<Configuration> = {}): Promise<Configuration<D>> {
    const paths = await ConfigurationLoader.getConfigPaths();

    for (let path of paths) {
      path = Utils.absolutePath(path);
      path = Utils.normalizePath(path);

      if (await pathExists(path)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const config = require(path);

        return new Configuration({ ...(config.default || config), ...options }, validate);
      }
    }

    throw new Error(`MikroORM config file not found in ['${paths.join(`', '`)}']`);
  }

  static async getPackageConfig(): Promise<Dictionary> {
    if (await pathExists(process.cwd() + '/package.json')) {
      return require(process.cwd() + '/package.json');
    }

    return {};
  }

  static async getSettings(): Promise<Settings> {
    const config = await ConfigurationLoader.getPackageConfig();
    return config['mikro-orm'] || {};
  }

  static async getConfigPaths(): Promise<string[]> {
    const paths: string[] = [];
    const settings = await ConfigurationLoader.getSettings();

    if (process.env.MIKRO_ORM_CLI) {
      paths.push(process.env.MIKRO_ORM_CLI);
    }

    paths.push(...(settings.configPaths || []));

    if (settings.useTsNode) {
      paths.push('./mikro-orm.config.ts');
    }

    paths.push('./mikro-orm.config.js');

    return paths;
  }

  static async registerTsNode(configPath = 'tsconfig.json') {
    const tsConfigPath = path.join(process.cwd(), configPath);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('ts-node').register({ project: tsConfigPath });

    if (await pathExists(tsConfigPath)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tsConfig = require(tsConfigPath);

      /* istanbul ignore next */
      const paths = tsConfig?.compilerOptions?.paths;

      if (paths) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('tsconfig-paths').register({
          baseUrl: tsConfig.compilerOptions.baseUrl,
          paths: tsConfig.compilerOptions.paths,
        });
      }
    }
  }

}

export interface Settings {
  useTsNode?: boolean;
  tsConfigPath?: string;
  configPaths?: string[];
}
