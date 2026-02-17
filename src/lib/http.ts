import { ZodSchema } from "zod";

export const parseBody = async <T>(request: Request, schema: ZodSchema<T>) => {
  const json = await request.json();
  return schema.parse(json);
};
