import data from "../data";
import { createConnection } from "mysql";
const db = createConnection(data.database);
db.connect();
db.query = require("util").promisify(db.query);

export default db;