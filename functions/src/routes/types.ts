export type ReturnTypeWithoutNew<T> = T extends (...args: never[]) => infer R ? R : never;
