import { Plugin, Configuration, Project, scriptUtils } from '@yarnpkg/core';
import { BaseCommand } from '@yarnpkg/cli';
import { Option } from 'clipanion';
import { loadScripts } from './parseScripts';
import { resolveAndExecuteCommand, ScriptSimple } from './commandExecution';
import { bulkExecute } from './runners/bulk-runner';
import { singleExecute } from './runners/single-runner';

class ExternalRunCommand extends BaseCommand {
    /**
     * Stage 1
     *
     * Resolves all of the scripts that need to be run, and spawns Stage 2 with them.
     * It does this from within the yarn context, so stage 2 will have access to the base
     * yarn configuration.
     */
    public static paths = [
        [`r`],
    ];

    public command = Option.String({ name: "command" });
    public arguments = Option.Proxy({ name: "arguments" });

    async execute() {
        const configuration = await Configuration.find(this.context.cwd, this.context.plugins);
        const { project, locator } = await Project.find(configuration, this.context.cwd);

        await project.restoreInstallState();

        const scripts = loadScripts(project.workspaces);

        const stdio = {
            stdout: this.context.stdout,
            stderr: this.context.stderr,
            stdin: this.context.stdin,
        }

        await resolveAndExecuteCommand(this.command, this.arguments, scripts, locator, project, stdio);
    }
}


class InternalRunCommand1 extends BaseCommand {
    /**
     * Stage 2
     *
     * Takes all of the commands, and spawns them under stage 3 using child_process.
     * Stage 2 is in charge of restarting the process if it fails, or one of it's dependencies
     * changes.
     */

    public static paths = [
        [`_r_internal_1`],
    ];

    public scripts = Option.Array("--command");
    public args = Option.String("--args");

    async execute() {
        const scripts = (this.scripts ?? [])
            .map((x) => JSON.parse(x) as ScriptSimple);
        const args = JSON.parse(this.args ?? "[]") as string[];

        if (scripts.length === 1) {
            singleExecute(scripts[0], args);
        } else {
            bulkExecute(scripts, args, this.context);
        }
    }
}


class InternalRunCommand2 extends BaseCommand {
    /**
     * Stage 3
     *
     * Runs the script from the working directory of the yarn workspace
     * in which the script was defined.
     */

    public static paths = [
        [`_r_internal_2`],
    ];

    public command = Option.String("--command");

    async execute() {
        const configuration = await Configuration.find(this.context.cwd, this.context.plugins);
        const { project, locator } = await Project.find(configuration, this.context.cwd);

        await project.restoreInstallState();

        const stdio = {
            stdout: this.context.stdout,
            stderr: this.context.stderr,
            stdin: this.context.stdin,
        }

        scriptUtils.executePackageShellcode(
            locator,
            "/bin/sh",
            ["-c", JSON.parse(this.command ?? '""')],
            { project, ...stdio }
        );
    }
}



const plugin: Plugin = {
    commands: [
        ExternalRunCommand,
        InternalRunCommand1,
        InternalRunCommand2
    ],
};

export default plugin;
