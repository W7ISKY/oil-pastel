"use strict";

(() => {
  const MAGIC = "OILINK02";
  const artPanel = document.getElementById("art-panel");
  const artFrame = document.getElementById("art-frame");

  let generation = 0;
  let artwork = null;
  let artworkURL = null;
  let requestController = null;
  let keyBytes = null;
  let plaintext = null;

  function clearImage() {
    for (const image of artFrame.querySelectorAll("img")) {
      image.removeAttribute("src");
    }
    artFrame.replaceChildren();
    if (artworkURL) URL.revokeObjectURL(artworkURL);
    artworkURL = null;
  }

  function clearResources() {
    generation += 1;
    requestController?.abort();
    requestController = null;
    keyBytes?.fill(0);
    plaintext?.fill(0);
    keyBytes = null;
    plaintext = null;
    clearImage();
    artwork = null;
    artPanel.hidden = true;
  }

  function showImage() {
    if (!artwork) return;
    clearImage();
    artworkURL = URL.createObjectURL(artwork);
    const image = document.createElement("img");
    image.alt = "لوحة فنية تتكوّن تدريجيًا بضربات اللون";
    image.decoding = "async";
    image.src = artworkURL;
    artFrame.append(image);
  }

  function readKey() {
    const parameters = new URLSearchParams(location.hash.slice(1));
    const values = parameters.getAll("k");
    if (values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0])) {
      throw new Error("Invalid link");
    }
    const encoded = values[0].replace(/-/g, "+").replace(/_/g, "/") + "=";
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    if (bytes.length !== 32) {
      bytes.fill(0);
      throw new Error("Invalid link");
    }
    return bytes;
  }

  async function openArtwork() {
    clearResources();
    const currentGeneration = generation;
    let currentKeyBytes = null;
    let currentPlaintext = null;
    document.documentElement.dataset.state = "loading";

    try {
      currentKeyBytes = readKey();
      keyBytes = currentKeyBytes;
      if (!globalThis.crypto?.subtle) {
        document.documentElement.dataset.state = "error";
        return;
      }

      const key = await crypto.subtle.importKey(
        "raw", currentKeyBytes, { name: "AES-GCM" }, false, ["decrypt"]
      );
      currentKeyBytes.fill(0);
      if (keyBytes === currentKeyBytes) keyBytes = null;
      if (currentGeneration !== generation) return;

      const controller = new AbortController();
      requestController = controller;
      const response = await fetch("painting.bin", {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error("Artwork unavailable");
      const envelope = new Uint8Array(await response.arrayBuffer());
      if (currentGeneration !== generation) return;
      if (envelope.length < 36 ||
          new TextDecoder("ascii").decode(envelope.subarray(0, 8)) !== MAGIC) {
        throw new Error("Invalid artwork");
      }

      currentPlaintext = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: envelope.subarray(8, 20), tagLength: 128 },
        key,
        envelope.subarray(20)
      ));
      if (currentGeneration !== generation) return;
      plaintext = currentPlaintext;
      const signature = new TextDecoder("ascii").decode(currentPlaintext.subarray(0, 6));
      if (signature !== "GIF87a" && signature !== "GIF89a") {
        throw new Error("Invalid artwork content");
      }

      artwork = new Blob([currentPlaintext], { type: "image/gif" });
      currentPlaintext.fill(0);
      if (plaintext === currentPlaintext) plaintext = null;
      showImage();
      artPanel.hidden = false;
      document.documentElement.dataset.state = "ready";
    } catch (error) {
      if (currentGeneration !== generation || error.name === "AbortError") return;
      clearImage();
      artwork = null;
      artPanel.hidden = true;
      document.documentElement.dataset.state = "error";
    } finally {
      currentKeyBytes?.fill(0);
      currentPlaintext?.fill(0);
      if (keyBytes === currentKeyBytes) keyBytes = null;
      if (plaintext === currentPlaintext) plaintext = null;
      if (currentGeneration === generation) requestController = null;
    }
  }

  window.addEventListener("pagehide", clearResources);
  window.addEventListener("hashchange", openArtwork);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) openArtwork();
  });
  openArtwork();
})();
