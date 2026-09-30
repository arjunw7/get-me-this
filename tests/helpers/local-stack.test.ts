import { describe, expect, it, vi } from "vitest";

import {
  FixtureScope,
  createSignedInFixture,
  isLocalStackUrl,
} from "./local-stack";

describe("local fixture target", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])("accepts local HTTP %s", (url) => {
    expect(isLocalStackUrl(url)).toBe(true);
  });
  it.each([
    "https://localhost:54321",
    "http://staging.example.invalid",
    "https://project.supabase.co",
    "not-a-url",
  ])("rejects nonlocal target %s", (url) => {
    expect(isLocalStackUrl(url)).toBe(false);
  });
});

describe("fixture lifetime", () => {
  it("deletes a created user when sign-in fails", async () => {
    const deleteUser = vi.fn(async () => {});
    const scope = new FixtureScope();
    await expect(
      createSignedInFixture(
        {} as never,
        {} as never,
        "fixture",
        { displayName: "Ada" },
        scope,
        {
          createUser: async () => "user-a",
          signIn: async () => {
            throw new Error("sign-in failed");
          },
          deleteUser,
        },
      ),
    ).rejects.toThrow("sign-in failed");
    expect(deleteUser).toHaveBeenCalledWith({}, "user-a");
  });

  it("cleans up A when creating B fails after A was registered", async () => {
    const closeA = vi.fn(async () => {});
    const closeB = vi.fn(async () => {});
    const deleteA = vi.fn(async () => {});
    const scope = new FixtureScope();
    let creations = 0;
    await expect(
      scope.run(async () => {
        scope.register("context A", closeA);
        await createSignedInFixture(
          {} as never,
          {} as never,
          "A",
          { displayName: "Ada" },
          scope,
          {
            createUser: async () => {
              creations += 1;
              return "user-a";
            },
            signIn: async () => {},
            deleteUser: deleteA,
          },
        );
        scope.register("context B", closeB);
        await createSignedInFixture(
          {} as never,
          {} as never,
          "B",
          { displayName: "Rohan" },
          scope,
          {
            createUser: async () => {
              creations += 1;
              throw new Error("creating B failed");
            },
            signIn: async () => {},
            deleteUser: async () => {},
          },
        );
      }),
    ).rejects.toThrow("creating B failed");
    expect(creations).toBe(2);
    expect(deleteA).toHaveBeenCalledOnce();
    expect(closeA).toHaveBeenCalledOnce();
    expect(closeB).toHaveBeenCalledOnce();
  });

  it("attempts every registered deletion and close after the first delete fails", async () => {
    const steps: string[] = [];
    const scope = new FixtureScope();
    scope.register("context A", async () => {
      steps.push("close A");
    });
    scope.register("user A", async () => {
      steps.push("delete A");
      throw new Error("delete A failed");
    });
    scope.register("context B", async () => {
      steps.push("close B");
    });
    scope.register("user B", async () => {
      steps.push("delete B");
    });
    await expect(scope.cleanup()).rejects.toThrow("fixture cleanup failed");
    expect(steps).toEqual(["delete B", "close B", "delete A", "close A"]);
  });

  it("keeps the setup failure visible when cleanup also fails", async () => {
    const scope = new FixtureScope();
    scope.register("user A", async () => {
      throw new Error("delete failed");
    });
    try {
      await scope.run(async () => {
        throw new Error("setup failed");
      });
      throw new Error("expected fixture failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors[0]).toEqual(
        new Error("setup failed"),
      );
    }
  });

  it("continues finalizing after a synchronous cleanup throw", async () => {
    const later = vi.fn(async () => {});
    const scope = new FixtureScope();
    scope.register("later", later);
    scope.register("throws", (() => {
      throw new Error("sync failure");
    }) as never);
    await expect(scope.cleanup()).rejects.toThrow("fixture cleanup failed");
    expect(later).toHaveBeenCalledOnce();
  });
});
