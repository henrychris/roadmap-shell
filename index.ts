const prompt = "sh> ";
process.stdout.write(prompt);

for await (let line of console) {
    line = line.trim();

    if (line === "exit") {
        process.exit(0);
    }

    try {
        const proc = Bun.spawn({
            cmd: [line],
            stdout: "inherit",
        });
        await proc.exited;
    } catch (error) {
        console.log("No such file or directory (os error 2)");
    }

    process.stdout.write(prompt);
}
