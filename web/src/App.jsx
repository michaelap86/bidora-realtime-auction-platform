import { Suspense, lazy } from "react";
import { Route, Routes, Link } from "react-router-dom";
import { PublicLayout, RequireRole } from "./components/Layout";
import { Spinner } from "./components/ui";
import { useSession } from "./lib/session";
import Home from "./pages/Home";
import Auctions from "./pages/Auctions";
import AuctionDetail from "./pages/AuctionDetail";
import { Login, Register, Verify, HowItWorks } from "./pages/Auth";
import { AccountLayout, Overview, MyBids, Watchlist, WalletPage, Orders, OrderDetail, NotificationsPage, Profile } from "./pages/Account";
import { SellerLayout, SellerDashboard, SellerListings, ListingForm, SellerOrders, Earnings } from "./pages/Seller";

const AdminApp = lazy(() => import("./pages/admin/AdminApp"));

const Fallback = () => <div className="grid min-h-[60vh] place-items-center"><Spinner className="h-8 w-8 text-brand" /></div>;

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-28 text-center">
      <p className="font-display text-7xl font-extrabold gradient-text">404</p>
      <p className="mt-3 text-xl font-bold">This page went to auction and sold.</p>
      <Link to="/" className="btn-primary mt-6">Back to home</Link>
    </div>
  );
}

export default function App() {
  const { ready, config } = useSession();
  if (!ready || !config) return <Fallback />;
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/admin/*" element={<RequireRole role="admin"><AdminApp /></RequireRole>} />
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="auctions" element={<Auctions />} />
          <Route path="auctions/:id" element={<AuctionDetail />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="verify" element={<Verify />} />
          <Route path="account" element={<RequireRole role="buyer"><AccountLayout /></RequireRole>}>
            <Route index element={<Overview />} />
            <Route path="bids" element={<MyBids />} />
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="seller" element={<RequireRole role="seller"><SellerLayout /></RequireRole>}>
            <Route index element={<SellerDashboard />} />
            <Route path="listings" element={<SellerListings />} />
            <Route path="listings/new" element={<ListingForm />} />
            <Route path="listings/:id/edit" element={<ListingForm />} />
            <Route path="orders" element={<SellerOrders />} />
            <Route path="earnings" element={<Earnings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
