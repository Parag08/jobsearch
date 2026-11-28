"use client";

import dynamic from "next/dynamic";

export const BehaviouralView = dynamic(() => import("./behavioural-view").then((mod) => mod.BehaviouralView));
export const CaseRoom = dynamic(() => import("./case-room").then((mod) => mod.CaseRoom));
export const FullInterview = dynamic(() => import("./full-interview").then((mod) => mod.FullInterview));
