import { Arguments, CommandModule } from 'yargs';
export declare class DebugCommand implements CommandModule {
    command: string;
    describe: string;
    /**
     * @inheritdoc
     */
    handler(args: Arguments): Promise<void>;
    private static checkPaths;
}
