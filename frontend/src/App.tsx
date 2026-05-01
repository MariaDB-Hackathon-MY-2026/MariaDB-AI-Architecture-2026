import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SchemaGenerator from './pages/SchemaGenerator';
import Diagrams from './pages/Diagrams';
import Migrations from './pages/Migrations';
import DataManager from './pages/DataManager';
import QueryAssistant from './pages/QueryAssistant';
import DemoMode from './pages/DemoMode';
import Audit from './pages/Audit';
import SettingsPage from './pages/Settings';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"     element={<Landing />} />
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/dashboard"   element={<Dashboard />} />
            <Route path="/schema"      element={<SchemaGenerator />} />
            <Route path="/diagrams"    element={<Diagrams />} />
            <Route path="/migrations"  element={<Migrations />} />
            <Route path="/data"        element={<DataManager />} />
            <Route path="/query"       element={<QueryAssistant />} />
            <Route path="/demo"        element={<DemoMode />} />
            <Route path="/audit"       element={<Audit />} />
            <Route path="/settings"    element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
