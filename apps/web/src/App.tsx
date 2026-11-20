import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { resolveFeaturePath, useFeatures } from '@repo/core';

import { AuthProvider } from './auth/AuthProvider';
import { RequireAdmin, RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { AccountsPage } from './pages/AccountsPage';
import { FeatureManagerPage } from './pages/FeatureManagerPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

function AppRoutes() {
  const entries = useFeatures();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="features" element={<FeatureManagerPage />} />
          </Route>
          {entries
            .filter((entry) => entry.enabled)
            .flatMap(({ feature }) =>
              feature.routes.map((route) => {
                const RouteElement = route.element;

                return (
                  <Route
                    key={`${feature.id}:${route.path}`}
                    path={resolveFeaturePath(feature.id, route.path)}
                    element={<RouteElement />}
                  />
                );
              }),
            )}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
