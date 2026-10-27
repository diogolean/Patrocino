import { HttpException } from "@nestjs/common";

export function apiError(status: number, code: string, message: string) {
  return new HttpException({ statusCode: status, code, message }, status);
}
