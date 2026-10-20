import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePrompts } from "../lib/queries.js";
import { useDebounce } from "../lib/util.js";
import { EmptyState, ErrorState, Skeleton } from "../components/ui.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import PromptCard from "../components/PromptCard.jsx";

const CardSkeleton = () => <Skeleton h={150} r={14} />;

export default function Saved() {
  const [q, setQ] = useState("");
  const [product, setProduct] = useState(null);
  const dq = useDebounce(q.trim(), 300);
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = usePrompts({ q: dq, product: product || undefined });
  const items = data?.pages.flatMap((p) => p.items) || [];
  const filtered = Boolean(dq || product);

  // Loads the next 20 when the end of the list comes into view.
  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && !isFetchingNextPage && fetchNextPage(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Prompt đã lưu</h1>
          <p>Những prompt đã ra video đẹp, để copy lại hoặc dùng lại và chỉnh.</p>
        </div>
      </div>

      <div className="toolbar">
        <input className="input" type="search" aria-label="Tìm prompt" placeholder="Tìm trong ghi chú, công cụ, tên sản phẩm" value={q} onChange={(e) => setQ(e.target.value)} />
        <ProductPicker value={product} onChange={(p) => setProduct(p?._id || null)} allowClear clearLabel="Tất cả sản phẩm" placeholder="Tất cả sản phẩm" label="Lọc theo sản phẩm" />
      </div>

      {isLoading ? (
        <div className="plist" aria-busy="true">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        filtered ? (
          <EmptyState title="Không thấy prompt nào khớp">Thử bỏ bớt bộ lọc hoặc tìm bằng từ khác.</EmptyState>
        ) : (
          <EmptyState
            title="Chưa lưu prompt nào"
            action={
              <Link to="/" className="btn btn-primary">
                Tạo prompt
              </Link>
            }
          >
            Tạo prompt, thử trên công cụ video, ra đẹp thì bấm “★ Lưu prompt tốt”.
          </EmptyState>
        )
      ) : (
        <div className="plist">
          {items.map((p) => (
            <PromptCard key={p._id} item={p} showProduct />
          ))}
          {isFetchingNextPage && <CardSkeleton />}
          <div ref={sentinel} className="sentinel" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
