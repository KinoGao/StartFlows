import { useQuery } from '@tanstack/react-query';

import { fetchImageModelCapabilities, IMAGE_MODEL_CAPABILITIES_QUERY_KEY, resolveImageModelCapability } from '@/flowcanvas/services/api/model-capabilities';
import { modelOptionName } from '@/flowcanvas/stores/use-config-store';

export function useImageModelCapability(model: string) {
    const query = useQuery({
        queryKey: IMAGE_MODEL_CAPABILITIES_QUERY_KEY,
        queryFn: fetchImageModelCapabilities,
        staleTime: 5 * 60_000,
    });
    return {
        ...query,
        capability: resolveImageModelCapability(query.data, modelOptionName(model)),
    };
}
