declare namespace Express {
  interface Request {
    cookies?: Record<string, string>;
  }
}
