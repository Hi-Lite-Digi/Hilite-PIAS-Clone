import { createBrowserRouter, RouterProvider } from "react-router";
import { APP_ROUTES } from "./routes";

const router = createBrowserRouter(APP_ROUTES);

export default function App() {
  return <RouterProvider router={router} />;
}
