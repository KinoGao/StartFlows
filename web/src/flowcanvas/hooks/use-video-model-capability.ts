import { useQuery } from '@tanstack/react-query';
import {
    fetchVideoModelCapabilities,
    resolveVideoModelCapability,
    VIDEO_MODEL_CAPABILITIES_QUERY_KEY,
} from '@/flowcanvas/services/api/model-capabilities';
import { modelOptionName } from '@/flowcanvas/stores/use-config-store';

export function useVideoModelCapability(model: string) {
    const query = useQuery({
        queryKey: VIDEO_MODEL_CAPABILITIES_QUERY_KEY,
        queryFn: fetchVideoModelCapabilities,
        staleTime: 5 * 60_000,
    });
    const normalizedModel = modelOptionName(model);
    const resolvedCapability = resolveVideoModelCapability(query.data, normalizedModel);
    return {
        ...query,
        capability: resolvedCapability,
    };
}
