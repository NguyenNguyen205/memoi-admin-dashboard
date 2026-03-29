"use server";

import { supabase } from "@/lib/supabase";
import { format, addDays } from "date-fns";

const EP_BASE = process.env.EP_BASE_URL ?? "https://demo.connect.easyparcel.sg/?ac=";
const API_KEY = process.env.EP_API_KEY ?? "";

// --- STRICT INTERFACES ---
export interface EPBulkSubmitPayload {
    weight: number;
    content: string;
    value: number;
    service_id: string;
    pick_name: string;
    pick_contact: string;
    pick_unit: string;
    pick_code: string;
    pick_country: string;
    send_name: string;
    send_contact: string;
    send_unit: string;
    send_code: string;
    send_country: string;
    collect_date: string;
    reference: string;
}

export interface EPOrderResult {
    status: string;
    remarks?: string;
    order_number: string;
    price?: string;
    messsage?: string; // Note: EasyParcel sometimes has this typo in their responses
}

export interface EPAWBResult {
    order_number: string;
    awb_url: string;
    awb_no?: string;
}

// Internal Type for the Supabase Joined Data
interface JoinedOrder {
    id: string;
    order_number: string;
    total: number;
    shipping_address_line_1: string | null;
    shipping_city: string | null;
    shipping_state: string | null;
    shipping_zip_postal_code: string | null;
    shipping_country: string | null;
    phone_number: string | null;
    billing_info: Array<{
        first_name: string;
        last_name: string;
        phone_number: string;
        address: string;
        city: string;
        state: string;
        zip_code: string;
        country: string;
    }> | null;
    users: {
        first_name: string | null;
        last_name: string | null;
        phone_number: string | null;
        address: string | null;
        city: string | null;
        state: string | null;
        zip_code: string | null;
        country: string | null;
    } | null;
    order_items: Array<{
        product_name: string;
        quantity: number;
    }> | null;
}

// --- STORE DETAILS ---
const SENDER = {
    name: "Your Store Name",
    contact: "81234567",
    postcode: "123456",
    country: "SG",
    unit: "01-01",
};

// --- UTILS ---
function encodeForm(data: Record<string, unknown>): URLSearchParams {
    const params = new URLSearchParams();
    const append = (key: string, value: unknown) => {
        if (value === undefined || value === null) return;
        params.append(key, String(value));
    };

    for (const key in data) {
        const value = data[key];
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                for (const subKey in item) {
                    append(`${key}[${index}][${subKey}]`, item[subKey]);
                }
            });
        } else {
            append(key, value);
        }
    }
    return params;
}

async function callEP<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    const form = encodeForm({ api: API_KEY, ...body });
    const res = await fetch(EP_BASE + action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
    });

    const raw = await res.text();
    console.log(raw);
    if (!res.ok) throw new Error(`EasyParcel HTTP ${res.status}: ${res.statusText}`);

    let json: unknown;
    try { json = JSON.parse(raw); }
    catch { throw new Error(`Invalid JSON from EasyParcel: ${raw}`); }

    const parsed = json as { status?: string; message?: string };
    if (parsed?.status && String(parsed.status) !== "200") {
        throw new Error(`EasyParcel Error: ${parsed.message ?? raw}`);
    }
    return json as T;
}

// --- MAIN ACTION ---
export async function processBulkFulfillment(orderIds: string[], defaultWeight: number = 1) {
    try {
        // 1. Check Credit
        const creditData = await callEP<{ credit?: string; result?: { credit: string } }>("EPCheckCreditBalance");
        const credit = parseFloat(creditData.credit ?? creditData.result?.credit ?? "0");
        if (credit <= 0) return { success: false, error: "Insufficient EasyParcel credit. Please top up." };

        // 2. Fetch Orders (Strictly typed)
        const { data: rawOrders, error: dbError } = await supabase
            .from("orders")
            .select(`
        id, order_number, total, shipping_address_line_1, shipping_city, shipping_state, shipping_zip_postal_code, shipping_country, phone_number,
        billing_info (first_name, last_name, phone_number, address, city, state, zip_code, country),
        users (first_name, last_name, phone_number, address, city, state, zip_code, country),
        order_items (product_name, quantity)
      `)
            .in("id", orderIds);

        if (dbError || !rawOrders) throw new Error("Failed to fetch orders from database.");

        const orders = rawOrders as unknown as JoinedOrder[];
        const bulkSubmitPayload: EPBulkSubmitPayload[] = [];
        const collectionDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

        // 3. Address Waterfall
        for (const order of orders) {
            const billing = order.billing_info?.[0];
            const user = order.users;

            const receiverName =
                order.shipping_address_line_1 ? "Customer" :
                    billing?.first_name ? `${billing.first_name} ${billing.last_name}` :
                        user?.first_name ? `${user.first_name} ${user.last_name}` : "Valued Customer";

            const receiverPhone = order.phone_number || billing?.phone_number || user?.phone_number || "00000000";
            const receiverZip = order.shipping_zip_postal_code || billing?.zip_code || user?.zip_code || "";
            const receiverCountry = order.shipping_country || billing?.country || user?.country || "SG";
            const receiverAddress = order.shipping_address_line_1 || billing?.address || user?.address || "";

            if (!receiverZip || !receiverAddress) {
                throw new Error(`Order ${order.order_number} is missing a valid shipping address or zip code.`);
            }

            const contentDesc = order.order_items?.map(item => `${item.quantity}x ${item.product_name}`).join(", ") || "Apparel";

            bulkSubmitPayload.push({
                weight: defaultWeight,
                content: contentDesc.substring(0, 50),
                value: order.total,
                service_id: "EP-CS04M",
                pick_name: SENDER.name,
                pick_contact: SENDER.contact,
                pick_unit: SENDER.unit,
                pick_code: SENDER.postcode,
                pick_country: SENDER.country,
                send_name: receiverName,
                send_contact: receiverPhone.replace(/\D/g, ""),
                send_unit: "01",
                send_code: receiverZip,
                send_country: receiverCountry,
                collect_date: collectionDate,
                reference: order.order_number
            });
        }

        // 4. Execute EasyParcel Sequence
        const submitResult = await callEP<{ result?: EPOrderResult[] }>("EPSubmitOrderBulk", { bulk: bulkSubmitPayload });
        const epOrders = submitResult?.result || [];
        const successfulOrders = epOrders.filter(r => r.status === "Success");

        if (successfulOrders.length === 0) {
            throw new Error(`Submission failed: ${epOrders[0]?.remarks || "Unknown error"}`);
        }

        const payPayload = successfulOrders.map(epOrder => ({ order_no: epOrder.order_number }));
        await callEP("EPPayOrderBulk", { bulk: payPayload });

        const awbResult = await callEP<{ result?: EPAWBResult[] }>("EPGetAWB", { bulk: payPayload });

        // 5. Update Database
        let updatedCount = 0;
        for (let i = 0; i < successfulOrders.length; i++) {
            const epOrder = successfulOrders[i];
            const awbData = awbResult?.result?.find(a => a.order_number === epOrder.order_number);
            const originalOrder = orders.find(o => o.order_number === epOrder.messsage || o.order_number === bulkSubmitPayload[i].reference);

            if (originalOrder && awbData?.awb_url) {
                await supabase
                    .from("orders")
                    .update({
                        status: "COMPLETED",
                        awb: awbData.awb_no || "Pending",
                        awb_tracking_url: awbData.awb_url,
                    })
                    .eq("id", originalOrder.id);
                updatedCount++;
            }
        }

        return { success: true, count: updatedCount, message: `Successfully fulfilled ${updatedCount} orders.` };

    } catch (error: unknown) {
        const err = error as Error;
        return { success: false, error: err.message || "An unexpected error occurred during fulfillment." };
    }
}

export async function getFulfillmentPreview(orderIds: string[], defaultWeight: number) {
    try {
        // 1. Fetch Current Credit
        const creditData = await callEP<{ credit?: string; result?: { credit: string } }>("EPCheckCreditBalance");
        const credit = parseFloat(creditData.credit ?? creditData.result?.credit ?? "0");

        // 2. Fetch Orders for Address Waterfall
        const { data: rawOrders, error: dbError } = await supabase
            .from("orders")
            .select(`
          id, shipping_zip_postal_code, shipping_country,
          billing_info (zip_code, country),
          users (zip_code, country)
        `)
            .in("id", orderIds);

        if (dbError || !rawOrders) throw new Error("Failed to fetch orders.");

        const orders = rawOrders as unknown as JoinedOrder[];
        const ratePayload = [];

        // 3. Build the Rate Check Payload
        for (const order of orders) {
            const billing = order.billing_info?.[0];
            const user = order.users;

            const receiverZip = order.shipping_zip_postal_code || billing?.zip_code || user?.zip_code || "";
            const receiverCountry = order.shipping_country || billing?.country || user?.country || "SG";

            if (receiverZip) {
                ratePayload.push({
                    pick_code: SENDER.postcode,
                    pick_country: SENDER.country,
                    send_code: receiverZip,
                    send_country: receiverCountry,
                    weight: defaultWeight
                });
            }
        }

        if (ratePayload.length === 0) return { success: true, credit, totalCost: 0 };

        // 4. Fetch Market Rates from EasyParcel
        const rateResult = await callEP<{ result?: any[] }>("EPRateCheckingBulk", { bulk: ratePayload });

        let totalCost = 0;

        // 5. Calculate the total of the cheapest available rates
        rateResult?.result?.forEach((res) => {
            if (res.status === "Success" && res.rates && res.rates.length > 0) {
                // Find the cheapest rate for this specific parcel
                const cheapest = Math.min(...res.rates.map((r: any) => parseFloat(r.price)));
                totalCost += cheapest;
            }
        });

        return { success: true, credit, totalCost };

    } catch (error: unknown) {
        const err = error as Error;
        return { success: false, error: err.message };
    }
}