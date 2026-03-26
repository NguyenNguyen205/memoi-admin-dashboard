"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, Spinner } from "@nextui-org/react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { DollarSign, ShoppingCart, AlertCircle, ArrowRightLeft } from "lucide-react";

// Helper to fetch dashboard metrics
const fetchDashboardData = async () => {
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

  // 1. Fetch recent completed orders for revenue and chart
  const { data: recentOrders } = await supabase
    .from("orders")
    .select("created_at, total")
    .eq("status", "COMPLETED")
    .gte("created_at", thirtyDaysAgo);

  // 2. Fetch pending exchanges count
  const { count: pendingExchanges } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("exchange_request_status", "Pending");

  // 3. Fetch total orders (all time, or you could scope this to 30 days)
  const { count: totalOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });

  // 4. Fetch low stock variants (stock < 5)
  const { count: lowStock } = await supabase
    .from("product_variants")
    .select("*", { count: "exact", head: true })
    .lt("stock", 5);

  // Calculate Total Revenue from the fetched orders
  const totalRevenue = recentOrders?.reduce((sum, order) => sum + Number(order.total), 0) || 0;

  // Group data by day for the chart
  const chartDataMap: Record<string, number> = {};

  // Initialize the last 14 days with 0 revenue so the chart looks complete
  for (let i = 14; i >= 0; i--) {
    const dateStr = format(subDays(new Date(), i), "MMM dd");
    chartDataMap[dateStr] = 0;
  }

  // Populate chart with actual data
  recentOrders?.forEach((order) => {
    const dateStr = format(new Date(order.created_at), "MMM dd");
    if (chartDataMap[dateStr] !== undefined) {
      chartDataMap[dateStr] += Number(order.total);
    }
  });

  const chartData = Object.keys(chartDataMap).map((date) => ({
    date,
    revenue: chartDataMap[date],
  }));

  return {
    totalRevenue,
    totalOrders: totalOrders || 0,
    pendingExchanges: pendingExchanges || 0,
    lowStock: lowStock || 0,
    chartData,
  };
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardData,
  });

  const kpis = [
    { title: "Revenue (30d)", value: `$${data?.totalRevenue.toLocaleString() || "0"}`, icon: DollarSign, color: "text-success" },
    { title: "Total Orders", value: data?.totalOrders || "0", icon: ShoppingCart, color: "text-primary" },
    { title: "Pending Exchanges", value: data?.pendingExchanges || "0", icon: ArrowRightLeft, color: "text-warning" },
    { title: "Low Stock Items", value: data?.lowStock || "0", icon: AlertCircle, color: "text-danger" },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Executive Overview" queryKey={["dashboard"]} />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" label="Loading business metrics..." />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, index) => (
              <Card key={index} className="border border-divider bg-content1 shadow-sm">
                <CardBody className="flex flex-row items-center justify-between p-6">
                  <div>
                    <p className="text-sm text-default-500 font-medium mb-1">{kpi.title}</p>
                    <h3 className="text-2xl font-bold">{kpi.value}</h3>
                  </div>
                  <div className={`p-3 rounded-xl bg-default-100 ${kpi.color}`}>
                    <kpi.icon size={24} />
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Revenue Chart */}
          <Card className="border border-divider bg-content1 shadow-sm">
            <CardBody className="p-6">
              <h3 className="text-lg font-semibold mb-6">Revenue Trend (Last 14 Days)</h3>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#006FEE" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#006FEE" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="date" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#006FEE"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}