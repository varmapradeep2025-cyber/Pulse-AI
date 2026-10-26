import { Navigate, useLocation, useParams } from "react-router-dom";

type RedirectTarget =
  | string
  | ((params: Readonly<Record<string, string | undefined>>) => string);

export default function LegacyRedirect({ to }: { to: RedirectTarget }) {
  const params = useParams();
  const { search, hash } = useLocation();
  const pathname = typeof to === "function" ? to(params) : to;

  return <Navigate to={`${pathname}${search}${hash}`} replace />;
}
