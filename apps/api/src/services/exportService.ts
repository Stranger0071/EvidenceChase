import { todayIsoDate, type ExportLinkDto, type ExportScope } from '@evidencechase/shared';
import archiver from 'archiver';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { Env } from '../config/env';
import { requestFolder, slugify, uniqueNamer } from '../domain/exportLayout';
import { DomainError, ForbiddenError, NotFoundError } from '../errors';
import { toCsv } from '../lib/csv';
import { contentDisposition } from '../lib/http';
import type { Logger } from '../lib/logger';
import { signLink, verifyLink } from '../lib/signedLink';
import type { StoragePort } from '../ports/storage';
import type { Repositories } from '../repositories';
import type { Clock } from './auditService';

const LINK_SECONDS = 60;

const INDEX_COLUMNS = [
  'control_ref',
  'title',
  'request_status',
  'owner_name',
  'owner_email',
  'due_date',
  'submitted_at',
  'accepted_at',
  'accepted_by',
  'file_name',
  'path_in_zip',
  'size_bytes',
  'sha256_recorded_at_upload',
  'sha256_in_this_export',
  'integrity',
  'retained_until',
];

const README = `EvidenceChase evidence pack
===========================

Each folder holds the accepted evidence for one control: <control ID>-<request title>.
index.csv lists every file with who supplied it, when it was submitted and accepted, and two
SHA-256 fingerprints:

  sha256_recorded_at_upload  computed by EvidenceChase when the file was uploaded
  sha256_in_this_export      computed again while this ZIP was being built

"OK" in the integrity column means the two match: the file is byte-for-byte what was uploaded.
Files are stored with S3 Object Lock until the retained_until date, so they can't be changed.

To check a file yourself:
  macOS / Linux:  shasum -a 256 "<file>"
  Windows:        Get-FileHash -Algorithm SHA256 "<file>"
`;

export type ExportSummary = {
  requests: number;
  files: number;
  mismatched: number;
  missing: number;
};

/** A pass-through stream that hashes everything flowing into the ZIP. */
function hashing() {
  const hash = createHash('sha256');
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  return { stream, digest: () => hash.digest('hex') };
}

/**
 * The audit-ready evidence pack (PRD Flow E, Phase 6). The download link goes straight to the
 * API, signed and valid for 60 seconds, because a long streaming download shouldn't pass through
 * the web app's proxy. Files are streamed from S3 into the ZIP one at a time, so memory stays flat
 * however big the audit is, and each is re-hashed on the way so tampering would show in index.csv.
 */
export function createExportService(
  repos: Repositories,
  storage: StoragePort,
  env: Env,
  logger: Logger,
  clock: Clock = () => new Date(),
) {
  const { audits, exports } = repos;

  function requireSecret(): string {
    if (!env.EXPORT_SIGNING_SECRET) {
      throw new DomainError(
        503,
        'EXPORT_DISABLED',
        'Evidence export is not configured on this server',
      );
    }
    return env.EXPORT_SIGNING_SECRET;
  }

  return {
    async createLink(
      managerId: string,
      auditId: string,
      scope: ExportScope,
    ): Promise<ExportLinkDto> {
      if (!(await audits.findOwned(auditId, managerId))) throw new NotFoundError('Audit');
      const expiresAt = new Date(clock().getTime() + LINK_SECONDS * 1000);
      const { exp, sig } = signLink(requireSecret(), [auditId, scope], expiresAt);
      const query = new URLSearchParams({ scope, exp, sig });
      return {
        url: `${env.API_PUBLIC_URL}/exports/${auditId}?${query}`,
        expiresAt: expiresAt.toISOString(),
      };
    },

    /** Checks a download link. The signature is the only credential (there's no session here). */
    authorize(
      auditId: string,
      query: { scope?: unknown; exp?: unknown; sig?: unknown },
    ): ExportScope {
      const scope = query.scope === 'all' || query.scope === 'accepted' ? query.scope : null;
      const check = scope
        ? verifyLink(requireSecret(), [auditId, scope], query.exp, query.sig, clock())
        : 'invalid';
      if (check === 'expired') {
        throw new DomainError(
          410,
          'LINK_EXPIRED',
          'This download link has expired. Start the export again.',
        );
      }
      if (check === 'invalid' || !scope)
        throw new ForbiddenError('This download link is not valid', 'LINK_INVALID');
      return scope;
    },

    async streamPack(
      auditId: string,
      scope: ExportScope,
      res: Response,
    ): Promise<ExportSummary | null> {
      const audit = await audits.findById(auditId);
      if (!audit) throw new NotFoundError('Audit');
      const requests = await exports.listForExport(auditId, scope);

      const filename = `${slugify(audit.name)}-evidence-${todayIsoDate(clock())}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', contentDisposition('attachment', filename));
      res.setHeader('Cache-Control', 'no-store');

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('warning', (error) => logger.warn({ err: error, auditId }, 'Export warning'));
      archive.on('error', (error) => {
        logger.error({ err: error, auditId }, 'Export failed');
        res.destroy(error);
      });
      archive.pipe(res);

      // If the browser gives up, stop pulling files from S3 instead of building the rest for nobody.
      const clientGone = new Promise<never>((_resolve, reject) => {
        res.once('close', () => {
          if (!res.writableFinished) reject(new Error('Client disconnected'));
        });
      });
      clientGone.catch(() => undefined);

      const rows: Array<Array<string | number | null>> = [INDEX_COLUMNS];
      const pathFor = uniqueNamer();
      const summary: ExportSummary = {
        requests: requests.length,
        files: 0,
        mismatched: 0,
        missing: 0,
      };

      try {
        for (const request of requests) {
          const folder = requestFolder(request.controlRef, request.title);
          const submission = request.submissions[0];
          const accepted = request.activity[0];
          const base = [
            request.controlRef,
            request.title,
            request.status,
            request.ownerName,
            request.ownerEmail,
            request.dueDate.toISOString().slice(0, 10),
            submission?.submittedAt.toISOString() ?? null,
            request.status === 'ACCEPTED' ? (accepted?.createdAt.toISOString() ?? null) : null,
            request.status === 'ACCEPTED' ? (accepted?.actorEmail ?? null) : null,
          ];

          const files = submission?.files ?? [];
          if (files.length === 0)
            rows.push([...base, null, null, null, null, null, 'NO_FILES', null]);

          for (const file of files) {
            const path = pathFor(folder, file.originalName);
            const retained = file.retainUntil?.toISOString().slice(0, 10) ?? null;
            let source;
            try {
              source = await storage.getStream(file.storageKey);
            } catch (error) {
              logger.error({ err: error, fileId: file.id }, 'Export: file missing from storage');
              summary.missing += 1;
              rows.push([
                ...base,
                file.originalName,
                null,
                file.sizeBytes,
                file.sha256,
                null,
                'MISSING',
                retained,
              ]);
              continue;
            }

            const hasher = hashing();
            source.once('error', (error) => hasher.stream.destroy(error));
            source.pipe(hasher.stream);
            archive.append(hasher.stream, { name: path, date: file.verifiedAt ?? file.createdAt });
            await Promise.race([finished(hasher.stream), clientGone]);

            const exportedHash = hasher.digest();
            const integrity = exportedHash === file.sha256 ? 'OK' : 'MISMATCH';
            if (integrity === 'MISMATCH') {
              summary.mismatched += 1;
              logger.error(
                { fileId: file.id, auditId },
                'Export: file does not match its recorded hash',
              );
            }
            summary.files += 1;
            rows.push([
              ...base,
              file.originalName,
              path,
              file.sizeBytes,
              file.sha256,
              exportedHash,
              integrity,
              retained,
            ]);
          }
        }

        archive.append(toCsv(rows), { name: 'index.csv' });
        archive.append(README, { name: 'README.txt' });
        await archive.finalize();
        logger.info({ auditId, scope, ...summary }, 'Evidence pack exported');
        return summary;
      } catch (error) {
        archive.abort();
        logger.warn({ err: error, auditId }, 'Export stopped before it finished');
        return null;
      }
    },
  };
}

export type ExportService = ReturnType<typeof createExportService>;
