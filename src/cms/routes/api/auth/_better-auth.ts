import { isAPIError } from "better-auth/api";

/** Run a Better Auth `asResponse` call; an APIError thrown on the way becomes its JSON response. */
export const authResponse = async (call: () => Promise<Response>): Promise<Response> => {
  try {
    return await call();
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return Response.json(error.body ?? { message: error.message }, { status: error.statusCode });
  }
};

export const readJson = async (response: Response): Promise<Record<string, any> | null> => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

/** 303 to `location`, carrying any cookies Better Auth set (session, two-factor, OAuth state). */
export const redirectWithCookies = (location: string, from?: Response | null) => {
  const response = new Response(null, { status: 303, headers: { Location: location } });
  for (const cookie of from?.headers.getSetCookie() ?? []) response.headers.append("Set-Cookie", cookie);
  return response;
};
