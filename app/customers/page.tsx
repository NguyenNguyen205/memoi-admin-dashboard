"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Card, CardBody, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip,
    Pagination, Input
} from "@nextui-org/react";
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { Users, UserPlus, Search } from "lucide-react";

const ROWS_PER_PAGE = 10;
const COLORS = ['#006FEE', '#17C964', '#F5A524', '#F31260', '#7828C8'];

// 1. Fetch Metrics (For the KPI Cards & Chart)
const fetchCustomerMetrics = async () => {
    const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

    const { count: totalUsers } = await supabase.from("users").select("*", { count: "exact", head: true });
    const { count: newUsers } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo);

    const { data: tierDataRaw } = await supabase.from("users").select("tier_name");

    const tierCounts: Record<string, number> = {};
    tierDataRaw?.forEach((user) => {
        const tier = user.tier_name || "Member";
        tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    });

    const tierData = Object.keys(tierCounts).map(key => ({ name: key, value: tierCounts[key] }));

    return {
        totalUsers: totalUsers || 0,
        newUsers: newUsers || 0,
        tierData,
    };
};

// 2. Fetch Directory (Paginated & Searchable table of ALL users)
const fetchUserDirectory = async (page: number, search: string) => {
    const from = (page - 1) * ROWS_PER_PAGE;
    const to = from + ROWS_PER_PAGE - 1;

    let query = supabase
        .from("users")
        .select("id, first_name, last_name, email, tier_name, current_spending, created_at", { count: "exact" })
        .order("created_at", { ascending: false });

    if (search) {
        query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data, count: count ?? 0 };
};

export default function CustomersPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
        queryKey: ["customerMetrics"],
        queryFn: fetchCustomerMetrics,
    });

    const { data: directory, isLoading: isLoadingDirectory } = useQuery({
        queryKey: ["userDirectory", page, debouncedSearch],
        queryFn: () => fetchUserDirectory(page, debouncedSearch),
    });

    const pages = directory?.count ? Math.ceil(directory.count / ROWS_PER_PAGE) : 0;

    return (
        <div className="flex flex-col h-full space-y-6">
            <PageHeader title="Customer Directory" queryKey={["customerMetrics", "userDirectory"]} />

            {/* Top Row: KPIs and Tier Breakdown */}
            {isLoadingMetrics ? (
                <div className="h-48 flex items-center justify-center bg-content1 rounded-xl border border-divider">
                    <Spinner label="Loading metrics..." />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-6">
                        <Card className="border border-divider shadow-sm">
                            <CardBody className="flex flex-row items-center justify-between p-6">
                                <div>
                                    <p className="text-sm text-default-500 font-medium mb-1">Total Members</p>
                                    <h3 className="text-3xl font-bold">{metrics?.totalUsers}</h3>
                                </div>
                                <div className="p-3 rounded-xl bg-primary/20 text-primary">
                                    <Users size={28} />
                                </div>
                            </CardBody>
                        </Card>
                        <Card className="border border-divider shadow-sm">
                            <CardBody className="flex flex-row items-center justify-between p-6">
                                <div>
                                    <p className="text-sm text-default-500 font-medium mb-1">New Signups (30d)</p>
                                    <h3 className="text-3xl font-bold text-success">+{metrics?.newUsers}</h3>
                                </div>
                                <div className="p-3 rounded-xl bg-success/20 text-success">
                                    <UserPlus size={28} />
                                </div>
                            </CardBody>
                        </Card>
                    </div>

                    <Card className="border border-divider shadow-sm lg:col-span-2">
                        <CardBody className="p-6 flex flex-row items-center">
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold mb-2">Loyalty Tier Distribution</h3>
                                <div className="h-[180px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={metrics?.tierData} innerRadius={50} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                                                {metrics?.tierData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Legend verticalAlign="middle" align="right" layout="vertical" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            )}

            {/* Bottom Row: Full User Directory */}
            <div className="flex flex-col flex-1 bg-content1 p-4 rounded-xl border border-divider">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 px-2">
                    <h3 className="text-lg font-semibold">All Registered Users</h3>
                    <Input
                        className="w-full sm:w-[300px]"
                        placeholder="Search email or name..."
                        startContent={<Search size={18} className="text-default-400" />}
                        value={search}
                        onValueChange={setSearch}
                        isClearable
                        onClear={() => setSearch("")}
                        size="sm"
                    />
                </div>

                <Table
                    aria-label="User directory table"
                    removeWrapper
                    bottomContent={
                        pages > 0 ? (
                            <div className="flex w-full justify-center pt-4">
                                <Pagination isCompact showControls showShadow color="primary" page={page} total={pages} onChange={(page) => setPage(page)} />
                            </div>
                        ) : null
                    }
                >
                    <TableHeader>
                        <TableColumn>CUSTOMER</TableColumn>
                        <TableColumn>EMAIL</TableColumn>
                        <TableColumn>JOINED</TableColumn>
                        <TableColumn>TIER</TableColumn>
                        <TableColumn align="end">LTV (SPEND)</TableColumn>
                    </TableHeader>
                    <TableBody
                        items={directory?.data || []}
                        isLoading={isLoadingDirectory}
                        loadingContent={<Spinner label="Loading users..." />}
                        emptyContent={!isLoadingDirectory && "No users found."}
                    >
                        {(user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.first_name} {user.last_name}</TableCell>
                                <TableCell className="text-default-500">{user.email}</TableCell>
                                <TableCell className="text-default-500 whitespace-nowrap">
                                    {format(new Date(user.created_at), "MMM d, yyyy")}
                                </TableCell>
                                <TableCell>
                                    <Chip size="sm" variant="flat" color={user.tier_name === 'Gold' ? 'warning' : 'primary'}>
                                        {user.tier_name || 'Member'}
                                    </Chip>
                                </TableCell>
                                <TableCell className="text-right font-semibold text-success">
                                    ${(Number(user.current_spending || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}