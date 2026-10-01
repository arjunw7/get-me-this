// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The snapshot module contract: deterministic private object paths, the
 * bounded upload attempts, the single owner-scoped UPDATE with in-flow
 * retries, and the containment of every later-step failure — a
 * normalization, upload, or UPDATE failure never blocks the save.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  normalizeCandidateImage: vi.fn(),
}));

vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("./extraction/image-normalizer", () => ({
  normalizeCandidateImage: mocks.normalizeCandidateImage,
}));
vi.mock("server-only", () => ({}));

import {
  SNAPSHOT_BUCKET,
  finalizeItemSnapshot,
  snapshotObjectPath,
} from "./item-snapshot";

const OWNER = "00000000-0000-4000-8000-00000000000a";
const ITEM = "00000000-0000-4000-8000-0000000000b0";
const SUBMISSION = "00000000-0000-5000-8000-0000000000c0";
const CANDIDATE = "https://img.example/lamp-1.webp";
const PATH = `${OWNER}/${SUBMISSION}.webp`;

type UpdateRecord = {
  payload: Record<string, unknown>;
  filters: string[];
};

type FakeClientOptions = {
  updateResults?: Array<{ data?: string[]; error?: boolean }>;
  uploadResults?: Array<{ error?: boolean }>;
};

function fakeClient(options: FakeClientOptions) {
  const updates: UpdateRecord[] = [];
  const uploads: Array<{
    bucket: string;
    path: string;
    contentType: string;
    upsert: boolean;
  }> = [];
  let updateIndex = 0;
  let uploadIndex = 0;
  const client = {
    from(table: string) {
      if (table !== "wishlist_items")
        throw new Error(`unexpected table ${table}`);
      return {
        update(payload: Record<string, unknown>) {
          const filters: string[] = [];
          const builder = {
            eq(_column: string, value: string) {
              filters.push(value);
              return builder;
            },
            select() {
              return {
                then(resolve: (r: { data: unknown; error: unknown }) => void) {
                  updates.push({ payload, filters });
                  const result = options.updateResults?.[updateIndex] ?? {};
                  updateIndex += 1;
                  resolve({
                    data: result.error
                      ? undefined
                      : (result.data ?? ["x"]).map((id) => ({ id })),
                    error: result.error ? new Error("boom") : null,
                  });
                },
              };
            },
          };
          return builder;
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          upload(
            path: string,
            _bytes: Uint8Array,
            uploadOptions: { contentType: string; upsert: boolean },
          ) {
            uploads.push({ bucket, path, ...uploadOptions });
            const result = options.uploadResults?.[uploadIndex] ?? {};
            uploadIndex += 1;
            return Promise.resolve({
              data: result.error ? null : { path },
              error: result.error ? new Error("boom") : null,
            });
          },
        };
      },
    },
  };
  return { client, updates, uploads };
}

function mockClient(options: FakeClientOptions) {
  const fake = fakeClient(options);
  mocks.createSupabaseServerClient.mockResolvedValue(fake.client);
  return fake;
}

beforeEach(() => {
  mocks.createSupabaseServerClient.mockReset();
  mocks.normalizeCandidateImage.mockReset();
});

describe("snapshotObjectPath", () => {
  it("is the pinned {owner_id}/{client_submission_id}.webp shape", () => {
    expect(snapshotObjectPath(OWNER, SUBMISSION)).toBe(PATH);
  });
});

describe("finalizeItemSnapshot", () => {
  it("normalizes the chosen candidate, uploads the WebP once, and runs the one owner-scoped UPDATE", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mocks.normalizeCandidateImage.mockResolvedValue(bytes);
    const fake = mockClient({ updateResults: [{ data: [ITEM] }] });

    const outcome = await finalizeItemSnapshot({
      ownerId: OWNER,
      itemId: ITEM,
      submissionId: SUBMISSION,
      candidateImageUrl: CANDIDATE,
      extractionStatus: "extracted",
    });

    expect(mocks.normalizeCandidateImage).toHaveBeenCalledWith(CANDIDATE);
    expect(outcome).toEqual({
      imageUrl: CANDIDATE,
      snapshotPath: PATH,
      uploaded: true,
    });
    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0]).toEqual({
      bucket: SNAPSHOT_BUCKET,
      path: PATH,
      contentType: "image/webp",
      upsert: true,
    });
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]).toEqual({
      payload: {
        image_url: CANDIDATE,
        image_snapshot_path: PATH,
        extraction_status: "extracted",
      },
      filters: [OWNER, ITEM],
    });
  });

  it("persists 'manual' with a null pair when no candidate was chosen (no fetch at all)", async () => {
    const fake = mockClient({ updateResults: [{ data: [ITEM] }] });

    const outcome = await finalizeItemSnapshot({
      ownerId: OWNER,
      itemId: ITEM,
      submissionId: SUBMISSION,
      candidateImageUrl: null,
      extractionStatus: "manual",
    });

    expect(mocks.normalizeCandidateImage).not.toHaveBeenCalled();
    expect(fake.uploads).toHaveLength(0);
    expect(outcome).toEqual({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });
    expect(fake.updates[0].payload).toEqual({
      image_url: null,
      image_snapshot_path: null,
      extraction_status: "manual",
    });
  });

  it("a failed normalization keeps the save: image_url persists, no snapshot, no upload", async () => {
    mocks.normalizeCandidateImage.mockResolvedValue(null);
    const fake = mockClient({ updateResults: [{ data: [ITEM] }] });

    const outcome = await finalizeItemSnapshot({
      ownerId: OWNER,
      itemId: ITEM,
      submissionId: SUBMISSION,
      candidateImageUrl: CANDIDATE,
      extractionStatus: "extracted",
    });

    expect(outcome).toEqual({
      imageUrl: CANDIDATE,
      snapshotPath: null,
      uploaded: false,
    });
    expect(fake.uploads).toHaveLength(0);
    expect(fake.updates[0].payload).toEqual({
      image_url: CANDIDATE,
      image_snapshot_path: null,
      extraction_status: "extracted",
    });
  });

  it("a failed upload keeps the save: no snapshot path persists", async () => {
    mocks.normalizeCandidateImage.mockResolvedValue(new Uint8Array([1]));
    const fake = mockClient({
      uploadResults: [{ error: true }, { error: true }],
      updateResults: [{ data: [ITEM] }],
    });

    const outcome = await finalizeItemSnapshot({
      ownerId: OWNER,
      itemId: ITEM,
      submissionId: SUBMISSION,
      candidateImageUrl: CANDIDATE,
      extractionStatus: "extracted",
    });

    expect(outcome).toEqual({
      imageUrl: CANDIDATE,
      snapshotPath: null,
      uploaded: false,
    });
    expect(fake.uploads).toHaveLength(2);
  });

  it("a normalization throw is contained and never propagates", async () => {
    mocks.normalizeCandidateImage.mockRejectedValue(
      new Error("fetch exploded"),
    );
    const fake = mockClient({ updateResults: [{ data: [ITEM] }] });

    const outcome = await finalizeItemSnapshot({
      ownerId: OWNER,
      itemId: ITEM,
      submissionId: SUBMISSION,
      candidateImageUrl: CANDIDATE,
      extractionStatus: "extracted",
    });

    expect(outcome).toEqual({
      imageUrl: CANDIDATE,
      snapshotPath: null,
      uploaded: false,
    });
    expect(fake.updates[0].payload.image_snapshot_path).toBeNull();
  });

  it("retries the UPDATE in-flow and reports the honest degraded outcome when it never lands", async () => {
    mocks.normalizeCandidateImage.mockResolvedValue(new Uint8Array([1]));
    const fake = mockClient({
      uploadResults: [{ error: false }],
      updateResults: [{ error: true }, { error: true }, { error: true }],
    });

    const outcome = await finalizeItemSnapshot({
      ownerId: OWNER,
      itemId: ITEM,
      submissionId: SUBMISSION,
      candidateImageUrl: CANDIDATE,
      extractionStatus: "extracted",
    });

    expect(fake.updates).toHaveLength(3);
    expect(outcome).toEqual({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });
  });

  it("the UPDATE retry converges after a transient failure", async () => {
    mocks.normalizeCandidateImage.mockResolvedValue(new Uint8Array([1]));
    const fake = mockClient({
      updateResults: [{ error: true }, { data: [ITEM] }],
    });

    const outcome = await finalizeItemSnapshot({
      ownerId: OWNER,
      itemId: ITEM,
      submissionId: SUBMISSION,
      candidateImageUrl: null,
      extractionStatus: "manual",
    });

    expect(fake.updates).toHaveLength(2);
    expect(outcome).toEqual({
      imageUrl: null,
      snapshotPath: null,
      uploaded: false,
    });
    // Re-running the UPDATE with the same values is idempotent: the payload
    // is identical across attempts.
    expect(fake.updates[0].payload).toEqual(fake.updates[1].payload);
  });
});
