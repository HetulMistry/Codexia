import { Route, BrowserRouter, Routes } from "react-router-dom";
import "./App.css";
import LandingPage from "./components/LandingPage.tsx";

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
