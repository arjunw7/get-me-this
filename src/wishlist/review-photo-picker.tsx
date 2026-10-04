"use client";

import { useState } from "react";

export function ReviewPhotoPicker({
  candidates,
  selectedImage,
  onSelectImage,
}: {
  candidates: readonly string[];
  selectedImage: string | null;
  onSelectImage: (value: string | null) => void;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const showPreview = selectedImage && failedImage !== selectedImage;

  return (
    <div className="min-w-0">
      {!candidates.length ? (
        <p className="mb-2 text-sm font-bold">Photo (optional)</p>
      ) : null}
      <div
        className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-surface-lg border-2 bg-surface-raised ${showPreview ? "border-outline-strong shadow-chunk" : "border-dashed border-outline-strong/35"}`}
      >
        {showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selectedImage}
            alt="Selected product photo"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setFailedImage(selectedImage)}
          />
        ) : (
          <div className="px-6 text-center text-content-secondary">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="mx-auto mb-3 h-8 w-8"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8" cy="8" r="1.5" />
              <path d="m3 17 6-6 4 4 3-3 5 5" />
            </svg>
            <p className="font-bold">
              {selectedImage
                ? "This photo couldn’t be previewed"
                : candidates.length
                  ? "No photo selected"
                  : "Photo preview"}
            </p>
            <p className="mt-1 text-sm">
              {selectedImage
                ? "Choose another photo or save without one."
                : candidates.length
                  ? "You can still save this item."
                  : "Adding photos isn’t available yet."}
            </p>
          </div>
        )}
      </div>
      {candidates.length ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-bold">
            Pick the photo friends will see
          </legend>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {candidates.map((src, index) => (
              <label key={src} className="relative inline-flex cursor-pointer">
                <input
                  type="radio"
                  name="photo-choice"
                  className="peer sr-only"
                  checked={selectedImage === src}
                  onChange={() => onSelectImage(src)}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Photo option ${index + 1}`}
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 rounded-control border-2 border-transparent object-cover opacity-70 peer-checked:border-outline-strong peer-checked:opacity-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
                />
                {selectedImage === src ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-outline-strong bg-action-primary"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                ) : null}
              </label>
            ))}
            <label className="relative inline-flex cursor-pointer">
              <input
                type="radio"
                name="photo-choice"
                className="peer sr-only"
                checked={selectedImage === null}
                onChange={() => onSelectImage(null)}
              />
              <span className="inline-flex h-16 items-center rounded-control border-2 border-dashed border-outline-strong/35 px-3 text-sm font-bold peer-checked:border-solid peer-checked:border-outline-strong peer-checked:bg-accent-highlight-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring">
                No photo
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
