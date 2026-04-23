type SchemaModule = {
  cmsTables: Record<string, { main: any; translations?: any; versions?: any }>;
  cmsAssets: any;
  cmsAssetFolders: any;
  cmsSessions: any;
  cmsLocks: any;
  cmsInvites: any;
  cmsAuditLog: any;
  [key: string]: any;
};

let schema: SchemaModule | null = null;

export const initSchema = (nextSchema: SchemaModule) => {
  schema = nextSchema;
};

export const resetSchema = () => {
  schema = null;
};

export const getSchema = (): SchemaModule => {
  if (!schema) {
    throw new Error("@/cms/core schema not initialized. Call initSchema(...) from your app before using runtime APIs.");
  }

  return schema;
};
