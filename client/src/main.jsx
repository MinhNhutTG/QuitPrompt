import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import Layout, { PageSkeleton } from "./components/Layout.jsx";
import { pages } from "./pages/index.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      // Retry only network errors and a waking server, never 4xx.
      retry: (count, err) => count < 2 && (err?.status === 0 || err?.status >= 500),
    },
  },
});

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user) return <Navigate to={location.state?.from || "/"} replace />;
  return children;
}

const { login: Login, builder: Builder, products: Products, productDetail: ProductDetail, saved: Saved, plans: Plans, resources: Resources, library: Library, settings: Settings, admin: Admin, notFound: NotFound } = pages;

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Suspense fallback={null}>
              <Login />
            </Suspense>
          </PublicOnly>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Builder />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="saved" element={<Saved />} />
        <Route path="plans" element={<Plans />} />
        <Route path="resources" element={<Resources />} />
        <Route path="library" element={<Library />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<PageSkeleton />}>
              <App />
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
