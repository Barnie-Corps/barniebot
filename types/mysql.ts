export type ParsedTableSchema = {
    tableName: string;
    columns: Map<string, string>;
    primaryKeyColumns: string[];
    uniqueColumns: string[];
    extraConstraints: string[];
};
