import { ACCESS_TOKEN_HEADER } from '@evidencechase/shared/constants';
import type { RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../errors';
import type { TokenWithRequest } from '../repositories/tokenRepository';
import type { TokenService } from '../services/tokenService';

/**
 * Authenticates an owner by the magic-link token in the X-Access-Token header. The token travels
 * in a header, never in the API's URL, so it stays out of access logs and Referer headers.
 */
export function requireOwnerToken(tokenService: TokenService): RequestHandler {
  return async (req, res, next) => {
    res.locals.ownerToken = await tokenService.validate(req.get(ACCESS_TOKEN_HEADER));
    next();
  };
}

/** The validated token. Only call it behind `requireOwnerToken`. */
export function ownerToken(res: Response): TokenWithRequest {
  const token = res.locals.ownerToken as TokenWithRequest | undefined;
  if (!token)
    throw new UnauthorizedError('This page needs the link from your email', 'LINK_INVALID');
  return token;
}
