import { useEffect, useState } from "react";
import { blurUrl, thumbUrl } from "../lib/util.js";

// Cloudinary image at display width (1x/2x), blurred placeholder, fixed ratio so nothing jumps.
export default function LazyImage({ image, width, alt = "", ratio, eager = false, fit = "cover", className = "" }) {
  const url = image?.url;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [url]);

  const w = Math.round(width);
  const ar = ratio || (image?.width && image?.height ? `${image.width} / ${image.height}` : "3 / 4");
  return (
    <div
      className={`img ${loaded ? "is-loaded" : ""} ${className}`}
      style={{ aspectRatio: ar, backgroundImage: url ? `url("${blurUrl(url)}")` : undefined }}
    >
      {url ? (
        <img
          src={thumbUrl(url, w)}
          srcSet={`${thumbUrl(url, w)} 1x, ${thumbUrl(url, w * 2)} 2x`}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          style={{ objectFit: fit }}
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <span className="img-empty" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );
}
