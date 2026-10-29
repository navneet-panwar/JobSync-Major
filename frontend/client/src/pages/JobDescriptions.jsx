import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { JdComposer } from "@/components/jd/JdComposer";
import { JdCard } from "@/components/jd/JdCard";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";

export default function JobDescriptions() {
  const { data, isLoading, error } = useJobDescriptions();
  const nav = useNavigate();

  const jds = data?.jds || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job descriptions"
        description="Paste a posting to see exactly which skills you already have — and which ones you're missing for that role."
      />

      <JdComposer />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={FileSearch}
          title="Couldn't load your job descriptions"
          description={error.message}
        />
      ) : jds.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="No job descriptions yet"
          description="Paste a posting above and AI will extract its required skills in a few seconds."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {jds.map((jd, i) => (
            <motion.div
              key={jd._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay: Math.min(i * 0.04, 0.3),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <JdCard
                jd={jd}
                onScore={(j) => nav(`/readiness?jdId=${j._id}`)}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
