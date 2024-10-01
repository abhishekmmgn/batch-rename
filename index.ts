import * as p from "@clack/prompts";
import color from "picocolors";
import pjson from "./package.json";
import * as fs from "node:fs";
import * as fsPromise from "node:fs/promises";
import * as path from "node:path";

type ItemType = "files" | "folders";

function listItems(directory: string, itemType: ItemType) {
	try {
		const files = fs.readdirSync(directory);
		const selectedItems: string[] = [];
		if (itemType === "files") {
			for (const file of files) {
				const filePath = path.join(directory, file);
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					selectedItems.push(file);
				}
			}
		} else if (itemType === "folders") {
			for (const file of files) {
				const filePath = path.join(directory, file);
				const stats = fs.statSync(filePath);
				if (stats.isDirectory()) {
					selectedItems.push(file);
				}
			}
		} else {
			for (const file of files) {
				const filePath = path.join(directory, file);
				const stats = fs.statSync(filePath);
				if (stats.isDirectory()) {
					selectedItems.push(color.blue(file));
				} else {
					selectedItems.push(file);
				}
			}
		}
		if (!selectedItems.length) {
			console.log(color.yellow(`No ${itemType} found`));
			process.exit(0);
		}
		return selectedItems;
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error(color.red(`Error listing files: ${error.message}`));
		} else {
			console.error(color.red("An unknown error occurred"));
		}
		process.exit(1);
	}
}

function sortItems(
	sortingType: "name" | "size" | "date",
	selectedFiles: string[],
	workingDir: string,
): string[] {
	// sort in ascending order

	if (sortingType === "date" || sortingType === "size") {
		return [...selectedFiles].sort((a, b) => {
			try {
				const fullPathA = path.join(workingDir, a);
				const fullPathB = path.join(workingDir, b);

				const statsA = fs.statSync(fullPathA);
				const statsB = fs.statSync(fullPathB);

				if (sortingType === "date") {
					return statsA.mtime.getTime() - statsB.mtime.getTime();
				} // size
				return statsA.size - statsB.size;
			} catch (error: unknown) {
				if (error instanceof Error) {
					if ("code" in error && error.code === "ENOENT") {
						console.log(
							color.yellow("File not found. Skipping this comparison."),
						);
						return 0; // Keep original order for files that can't be accessed
					}
					console.error(`Error accessing files: ${error.message}`);
				}

				// For other errors, also skip the comparison
				return 0;
			}
		});
	}
	return [...selectedFiles].sort((a, b) => a.localeCompare(b));
}

async function rename(
	workingDir: string,
	selectedFiles: string[],
	patternType: "prefix" | "suffix" | "numbering",
	term?: string | null,
) {
	for (let i = 0; i < selectedFiles.length; i++) {
		const oldPath = path.join(workingDir, selectedFiles[i]);
		const ext = path.extname(selectedFiles[i]);
		const nameWithoutExt = path.basename(selectedFiles[i], ext);
		let newName: string;
		switch (patternType) {
			case "numbering":
				newName = `${(i + 1).toString()}${ext}`;
				break;
			case "prefix":
				newName = `${term}${nameWithoutExt}${ext}`;
				break;
			case "suffix":
				newName = `${nameWithoutExt}${term}${ext}`;
				break;
			default:
				console.log(color.yellow("Renaming pattern not specified."));
				process.exit(1);
		}

		const newPath = path.join(workingDir, newName);

		try {
			await fsPromise.rename(oldPath, newPath);
		} catch (error) {
			console.log(error);
			console.log(oldPath, newPath);
		}
	}
}

async function main() {
	const argv = process.argv;
	let workingDir: null | string = null;

	if (argv.length > 3) {
		console.log(color.red("Invalid arguments"));
		process.exit(0);
	} else if (argv.length === 3) {
		if (argv[2] === "--help" || argv[2] === "-h") {
			console.log(`
            `);
			process.exit(0);
		} else if (argv[2] === "--version" || argv[2] === "-v") {
			console.log(pjson.version);
			process.exit(0);
		} else if (argv[2] === ".") {
			workingDir = ".";
		} else {
			console.log(color.red("Invalid argument"));
			process.exit(1);
		}
	}
	if (!workingDir) {
		// Ask for working directory
		// ask for current working directory
		const askWorkingDir = await p.text({
			message: "Which directory the files are stored?",
			placeholder: "~/",
			validate(value) {
				if (value.length === 0) return "Value is required!";
			},
		});
		if (typeof askWorkingDir === "string") {
			workingDir = askWorkingDir.startsWith("~")
				? askWorkingDir.replace("~", process.env.HOME || "")
				: (workingDir as string);
		}
	}

	// Move to working directory
	try {
		if (workingDir === ".") {
			console.log(
				color.green(`Staying in current directory: ${process.cwd()}`),
			);
		} else {
			process.chdir(workingDir as string);
			console.log(
				color.green(`Changed working directory to: ${process.cwd()}`),
			);
		}
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error(color.red(error.message));
		} else {
			console.error(color.red("An unknown error occurred"));
		}
		process.exit(1);
	}

	const itemType = await p.select({
		message: "Pick item type",
		options: [
			{ value: "files", label: "Files" },
			{ value: "folders", label: "Folders" },
		],
	});
	const items = listItems(workingDir as string, itemType as ItemType);

	// -------- Sort the items --------
	const askForSort = await p.confirm({
		message: "Would you like to sort the items?",
		initialValue: false,
	});
	let sortedFiles: string[] = items;
	if (askForSort) {
		const sortingType = await p.select({
			message: "Sort the files by: ",
			options: [
				{
					value: "date",
					label: "Date",
				},
				{
					value: "size",
					label: "Size",
				},
				{
					value: "name",
					label: "Name",
				},
			],
		});
		sortedFiles = sortItems(
			sortingType as "name" | "size" | "name",
			items as string[],
			workingDir as string,
		);
	}
	const selectedFiles = await p.multiselect({
		message: `Select ${itemType}`,
		options: sortedFiles.map((item) => ({ value: item, label: item })),
	});
	// Renaming pattern
	const patternType = await p.select({
		message: "Pick a pattern type",
		options: [
			{ value: "prefix", label: "Prefix" },
			{ value: "suffix", label: "Suffix" },
			{ value: "numbering", label: "Numbering" },
		],
	});
	let term: string | null = null;
	if (patternType === "prefix" || patternType === "suffix") {
		const termInput = await p.text({
			message: `Enter ${patternType} term`,
		});
		term = termInput as string;
	}
	rename(
		workingDir as string,
		selectedFiles as string[],
		patternType as "prefix" | "suffix" | "numbering",
		term as string | null,
	);
}

main().catch(console.error);
