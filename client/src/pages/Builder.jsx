import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { useCan } from "../auth.jsx";
import { buildIndex } from "../lib/actions.js";
import { buildPrompt, DEFAULT_STATE, DURATIONS, KINDS, normalizeSettings, sanitizeIds } from "../lib/prompt.js";
import { putProduct, useProducts, useSettings } from "../lib/queries.js";
import { store } from "../lib/util.js";
import { Field, Seg } from "../components/ui.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import Sequence from "../components/Sequence.jsx";
import PromptPanel from "../components/PromptPanel.jsx";
import SavePromptDialog from "../components/SavePromptDialog.jsx";
import { useToast } from "../components/Toast.jsx";

// The draft survives reloads and an expired session (tài liệu 05, mục 6).
function loadDraft() {
  const d = store.get("draft", null);
  if (!d || typeof d !== "object") return DEFAULT_STATE;
  return { ...DEFAULT_STATE, ...normalizeSettings(d), productId: typeof d.productId === "string" ? d.productId : null };
}

// Choosing a product fills the per-product options; they stay editable for this prompt only.
const fromProduct = (p) => ({ productId: p._id, closed: p.closed !== false, extraNeg: p.extraNeg || "" });

export default function Builder() {
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { data: settings } = useSettings();
  const { data: productsData, isFetching: productsFetching } = useProducts();
  const [state, setState] = useState(loadDraft);
  const [saving, setSaving] = useState(false);
  const prefill = useRef(null);

  const set = useCallback((patch) => setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })), []);
  const index = useMemo(() => buildIndex(settings?.customActions), [settings]);

  // Entry points: "Dùng lại và chỉnh" (router state) and "Tạo prompt cho sản phẩm này" (?product=).
  useEffect(() => {
    const reuse = location.state?.reuse;
    const pid = params.get("product");
    if (reuse) {
      setState({ ...DEFAULT_STATE, ...normalizeSettings(reuse.settings), productId: reuse.productId || null });
      toast("Đã nạp lựa chọn của prompt cũ");
    } else if (pid) {
      prefill.current = pid;
      set({ productId: pid });
    }
    if (reuse || pid) navigate("/", { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const products = productsData?.items;
  const product = products?.find((p) => p._id === state.productId) || null;

  useEffect(() => {
    if (!products) return;
    if (prefill.current) {
      const p = products.find((x) => x._id === prefill.current);
      prefill.current = null;
      if (p) set(fromProduct(p));
    }
    // A product deleted elsewhere must not stay selected (a refetch may still bring a just-created one).
    if (state.productId && !productsFetching && !products.some((p) => p._id === state.productId)) set({ productId: null });
  }, [products, productsFetching, state.productId, set]);

  // Custom actions are known only once settings arrive; then drop ids that no longer exist.
  useEffect(() => {
    if (settings) setState((s) => sanitizeIds(s, index));
  }, [settings, index]);

  useEffect(() => store.set("draft", state), [state]);

  const result = useMemo(
    () => buildPrompt(state, index, { template: settings?.template, negative: settings?.negative }),
    [state, index, settings]
  );

  async function createProduct(name) {
    try {
      const { item } = await api.createProduct({ name });
      putProduct(qc, item);
      set(fromProduct(item));
      toast(`Đã tạo sản phẩm ${item.name}`, { action: { label: "Thêm ảnh", to: `/products/${item._id}` } });
    } catch (e) {
      toast(e.message, { tone: "danger" });
    }
  }

  return (
    <div className="page">
      <div className="grid-2 builder">
        <div className="card">
          <div className="sec">
            <h2 className="sec-h">
              <span className="sec-n" aria-hidden="true">1</span>Sản phẩm
            </h2>
            <ProductPicker
              value={state.productId}
              onChange={(p) => set(p ? fromProduct(p) : { productId: null })}
              onCreate={can("product.edit") ? createProduct : undefined}
              allowClear
            />
          </div>

          <div className="sec">
            <h2 className="sec-h">
              <span className="sec-n" aria-hidden="true">2</span>Người mẫu và thời lượng
            </h2>
            <div className="row">
              <span className="row-label">Kiểu video</span>
              <Seg name="kind" label="Kiểu video" value={state.kind} onChange={(kind) => set({ kind })} options={KINDS} />
            </div>
            {state.kind === "selfie" && (
              <p className="hint">Người mẫu cầm điện thoại tay phải che kín mặt suốt clip, chỉ tay trái cử động. Template này cố định, không sửa trong Cài đặt.</p>
            )}
            <div className="row">
              <span className="row-label">Người mẫu</span>
              <Seg
                name="gender"
                label="Người mẫu"
                value={state.gender}
                onChange={(gender) => set({ gender })}
                options={[
                  { value: "f", label: "Nữ" },
                  { value: "m", label: "Nam" },
                ]}
              />
            </div>
            <div className="row">
              <span className="row-label">Thời lượng</span>
              <Seg
                name="dur"
                label="Thời lượng"
                value={state.dur}
                onChange={(dur) => set({ dur })}
                options={DURATIONS.map((d) => ({ value: d, label: `${d} giây` }))}
              />
            </div>
          </div>

          <Sequence state={state} set={set} index={index} result={result} />

          <div className="sec">
            <h2 className="sec-h">
              <span className="sec-n" aria-hidden="true">4</span>Tuỳ chọn
            </h2>
            <div className="row">
              <label className="check">
                <input type="checkbox" checked={state.closed} onChange={(e) => set({ closed: e.target.checked })} />
                Áo luôn đóng
              </label>
              <label className="check">
                <input type="checkbox" checked={state.cont} onChange={(e) => set({ cont: e.target.checked })} />
                Nối tiếp clip trước
              </label>
            </div>
            <Field label="Âm thanh">
              <select className="input" value={state.audio} onChange={(e) => set({ audio: e.target.value })}>
                <option value="none">Không có</option>
                <option value="amb">Tiếng môi trường nhẹ</option>
              </select>
            </Field>
            <Field label="Lỗi riêng cần chặn" hint="Tiếng Anh, cách nhau bằng dấu phẩy. Thêm vào câu “No...” cuối prompt.">
              <input
                className="input"
                value={state.extraNeg}
                maxLength={1000}
                placeholder="shrinking brim, missing drawstring"
                onChange={(e) => set({ extraNeg: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="card slate ink">
          <PromptPanel product={product} result={result} onSave={can("prompt.save") ? () => setSaving(true) : undefined} />
        </div>
      </div>

      <SavePromptDialog
        open={saving}
        onClose={() => setSaving(false)}
        state={state}
        result={result}
        onSaved={(p) => !state.productId && set({ productId: p._id })}
      />
    </div>
  );
}
