import { Plugin, Configuration, Project } from '@yarnpkg/core';
import { BaseCommand } from '@yarnpkg/cli';
import { Option } from 'clipanion';
import { loadScripts } from './parseScripts';
import { resolveAndExecuteCommand, ScriptSimple } from './commandExecution';
import { bulkExecute } from './runners/bulk-runner';
import { singleExecute } from './runners/single-runner';

class ExternalRunCommand extends BaseCommand {
    public static paths = [
        [`r`],
    ];

    public command = Option.String({ name: "command" });
    public arguments = Option.Proxy({ name: "arguments" });

    async execute() {
        const configuration = await Configuration.find(this.context.cwd, this.context.plugins);
        const { project, workspace, locator } = await Project.find(configuration, this.context.cwd);

        await project.restoreInstallState();

        if (workspace) {
            const workspaces = project.workspaces
            const manifests = workspaces.map((workspace) => workspace.manifest);
            const scripts = loadScripts(manifests);
            const stdio = {
                stdout: process.stdout,
                stderr: process.stderr,
                stdin: process.stdin,
            }

            await resolveAndExecuteCommand(this.command, this.arguments, scripts, locator, project, stdio);
        }
    }
}


class InternalRunCommand extends BaseCommand {
    public static paths = [
        [`_r_internal`],
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


const plugin: Plugin = {
    commands: [
        ExternalRunCommand,
        InternalRunCommand
    ],
};

export default plugin;
