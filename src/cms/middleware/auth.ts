import { defineMiddleware } from "astro:middleware";
import { kideMiddleware } from "./gate";

export const onRequest = defineMiddleware((context, next) => kideMiddleware(context, () => next()));
