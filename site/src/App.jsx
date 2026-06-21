import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import ScrollMap from "./pages/ScrollMap.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="scrollmap" element={<ScrollMap />} />
      </Route>
    </Routes>
  );
}
