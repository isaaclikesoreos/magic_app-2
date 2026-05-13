import { FC } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ImageCacheProvider } from './context/ImageCacheContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
// import Profile from './pages/Profile';
// import Cubes from './pages/Cubes';
// import CreateCube from './pages/CreateCube';
// import NewDraft from './pages/NewDraft';
// import Lobbies from './pages/Lobbies';
// import CubeDetail from './pages/CubeDetail';
// import Draft from './pages/Draft';
import Puzzles from './pages/Puzzles';
import PuzzleViewer from './pages/PuzzleViewer';
import Freestyle from './pages/Freestyle';

const App: FC = () => {
  return (
    <AuthProvider>
      <ImageCacheProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="min-h-screen bg-gray-900 text-white">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              {/* <Route path="/profile" element={<Profile />} /> */}
              {/* <Route path="/cubes" element={<Cubes />} /> */}
              {/* <Route path="/cubes/new" element={<CreateCube />} /> */}
              {/* <Route path="/cubes/:id" element={<CubeDetail />} /> */}
              {/* <Route path="/draft/new" element={<NewDraft />} /> */}
              {/* <Route path="/draft/:id" element={<Draft />} /> */}
              {/* <Route path="/lobbies" element={<Lobbies />} /> */}
              <Route path="/puzzles" element={<Puzzles />} />
              <Route path="/puzzles/:id" element={<PuzzleViewer />} />
              <Route path="/freestyle" element={<Freestyle />} />
            </Routes>
          </main>
        </div>
      </Router>
      </ImageCacheProvider>
    </AuthProvider>
  );
};

export default App;
