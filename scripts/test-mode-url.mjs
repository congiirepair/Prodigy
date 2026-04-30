const scenario = ["qualifying", "bracket", "twin"].includes(process.argv[2])
  ? process.argv[2]
  : "qualifying";

const baseUrl = process.env.PRODIGY_LOCAL_URL || "http://localhost:5000";
const url = new URL(baseUrl);
url.searchParams.set("testMode", "1");
url.searchParams.set("seedTest", scenario);
url.hash = "#/event-admin/registration";

console.log(url.toString());
