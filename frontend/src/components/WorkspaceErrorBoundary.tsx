import React from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/glass";

type WorkspaceErrorBoundaryProps = {
  children: React.ReactNode;
  title: string;
  description: string;
};

type WorkspaceErrorBoundaryState = {
  hasError: boolean;
};

export class WorkspaceErrorBoundary extends React.Component<
  WorkspaceErrorBoundaryProps,
  WorkspaceErrorBoundaryState
> {
  state: WorkspaceErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: WorkspaceErrorBoundaryProps) {
    if (this.state.hasError && previousProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="rounded-[2rem] border-amber-300/20 bg-amber-500/10 p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3">
              <AlertTriangle size={18} className="text-amber-100" />
            </div>
            <div>
              <div className="text-sm font-medium text-white">{this.props.title}</div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-300">{this.props.description}</p>
            </div>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
