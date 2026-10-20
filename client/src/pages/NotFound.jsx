import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui.jsx";

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState
        title="Không có trang này"
        action={
          <Link to="/" className="btn btn-primary">
            Về trang tạo prompt
          </Link>
        }
      >
        Đường dẫn có thể đã cũ hoặc gõ nhầm.
      </EmptyState>
    </div>
  );
}
