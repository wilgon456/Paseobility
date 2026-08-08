export function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized;
}

if (require.main === module) {
  const cases: Array<[string, string]> = [
    ["  Alice Smith  ", "alice_smith"],
    ["JOHN   DOE", "john_doe"],
    ["  user__name!!  ", "user_name"],
    ["___Test___User___", "test_user"],
    ["", ""],
    ["   ", ""],
    ["!!!@@@", ""],
    ["\tHello\nWorld\t", "hello_world"],
    ["Ålice Éxample", "lice_xample"],
  ];

  for (const [input, expected] of cases) {
    const actual = normalizeUsername(input);
    if (actual !== expected) {
      throw new Error(
        `normalizeUsername(${JSON.stringify(input)}) => ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
      );
    }
  }

  console.log("All normalizeUsername tests passed.");
}
