import { v4 as uuidv4 } from "uuid";

export function makePrefixedId(prefix: string): string {
  return `${prefix}${uuidv4().replace(/-/g, "")}`;
}
