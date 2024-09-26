import { type Subprocess } from "bun";

async function main() {
    const prompt = "sh> ";
    process.stdout.write(prompt);

    for await (let line of console) {
        await handleLine(line.trim());
        process.stdout.write(prompt);
    }
}

//#region HANDLING LINE INPUT

async function handleLine(line: string) {
    if (line === "exit") {
        process.exit(0);
    }

    try {
        if (line.includes("|")) {
            await processPipeline(line);
        } else {
            await processNormalLine(line);
        }
    } catch (error) {
        handleError(error);
    }
}

//#endregion

//#region PROCESSING COMMANDS

async function processNormalLine(line: string) {
    const commands = getListOfCommands(line);
    await executeCommand(commands);
}

async function processPipeline(line: string) {
    const commands = getListOfCommands(line);
    const commandSections = getCommandSections(commands);

    try {
        await executePipeline(commandSections);
    } catch (error) {
        handleError(error);
    }
}

//#endregion

//#region PIPELINE EXECUTION

async function executePipeline(commandSections: string[][]) {
    let previousProc: Subprocess | null = null;

    for (let i = 0; i < commandSections.length; i++) {
        const section = commandSections[i];

        if (i === 0) {
            // First process reads from terminal stdin
            previousProc = createProcess(section, "pipe");
        } else {
            // For subsequent processes
            const input = await Bun.readableStreamToBlob(
                previousProc!.stdout as ReadableStream
            );

            const currentProc = createProcess(
                section,
                i === commandSections.length - 1 ? "inherit" : "pipe",
                input
            );

            await previousProc!.exited; // Wait for the previous process to finish
            previousProc = currentProc; // Move to next process
        }
    }

    if (previousProc) await previousProc.exited; // Wait for the final process
}

//#endregion

//#region COMMAND EXECUTION AND PROCESS CREATION

async function executeCommand(commands: string[]) {
    const command = commands[0];

    if (command === "cd") {
        changeDirectory(commands[1]);
    } else {
        const proc = createProcess(commands, "inherit");
        await proc.exited;
    }
}

function createProcess(
    commands: string[],
    stdout: "pipe" | "inherit",
    stdin: any = undefined
): Subprocess {
    return Bun.spawn({
        cmd: commands,
        stdout,
        stdin,
        env: { ...Bun.env },
    });
}

function changeDirectory(path: string) {
    try {
        process.chdir(path);
    } catch {
        throw new Error(`cd: ${path}: No such file or directory`);
    }
}

//#endregion

//#region UTILITY FUNCTIONS

function getListOfCommands(line: string): string[] {
    return line.split(" ").filter(Boolean);
}

function getCommandSections(commands: string[]): string[][] {
    const commandSections: string[][] = [];
    let section: string[] = [];

    commands.forEach((command) => {
        if (command === "|") {
            if (section.length) {
                commandSections.push(section);
            }

            section = [];
        } else {
            section.push(command);
        }
    });

    if (section.length) {
        commandSections.push(section);
    }
    return commandSections;
}

function handleError(error: unknown) {
    const err = error as Error;
    console.error(err.message);
    // console.error(`Error: ${err.message}`);
}

function printCommandSections(commandSections: string[][]) {
    console.log("Command Sections:");
    commandSections.forEach((section, index) => {
        console.log(`Section ${index + 1}:`, section);
    });
}

//#endregion

await main();
