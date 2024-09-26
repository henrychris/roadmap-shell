async function main() {
    const prompt = "sh> ";
    process.stdout.write(prompt);

    for await (let line of console) {
        line = line.trim();

        if (line === "exit") {
            process.exit(0);
        }

        try {
            var commands = getListOfCommands(line);

            const proc = Bun.spawn({
                cmd: commands,
                stdout: "inherit",
            });
            await proc.exited;
        } catch (error) {
            const err = error as Error;
            console.error(err.message);
            console.log("No such file or directory (os error 2)");
        }

        process.stdout.write(prompt);
    }
}

function getListOfCommands(line: string): string[] {
    let commands: string[] = [];
    let word = "";

    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        console.log(`char:${char}.`);

        if (char !== " ") {
            word += char;
        } else {
            if (word) {
                // Ensures that empty strings are not pushed
                commands.push(word);
                console.log(`Pushed word to commands array: ${word}.`);
                word = "";
            }
        }
    }

    // Push the last word to the array (if there is any)
    if (word) {
        commands.push(word);
        console.log(`Pushed last word to commands array: ${word}.`);
    }

    return commands;
}

function listElements(arr: any[]) {
    arr.forEach((element) => {
        console.log(`element: ${element}`);
    });
}

await main();
