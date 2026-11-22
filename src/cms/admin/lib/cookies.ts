export const getCookie = (request: Request, name: string) => {
  for (const part of (request.headers.get("cookie") ?? "").split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index) === name) {
      try {
        return decodeURIComponent(part.slice(index + 1));
      } catch {
        return part.slice(index + 1);
      }
    }
  }
  return undefined;
};
