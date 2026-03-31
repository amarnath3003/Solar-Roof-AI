import { useCallback, useEffect, useState } from "react";
import { Coordinates, NominatimResult } from "@/types";

type UseAddressSearchOptions = {
  onLocationSelected?: () => void;
};

export function useAddressSearch({ onLocationSelected }: UseAddressSearchOptions = {}) {
  const [address, setAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchAddress = useCallback(async (queryToSearch: string) => {
    const query = queryToSearch.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`
      );
      const data = (await response.json()) as NominatimResult[];
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const selectAddress = useCallback(
    (result: NominatimResult) => {
      const lat = Number(result.lat);
      const lng = Number(result.lon);

      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        setAddress(result.display_name);
        setSelectedAddress(result.display_name);
        setCoordinates({ lat, lng });
        setSearchResults([]);
        onLocationSelected?.();
      }
    },
    [onLocationSelected]
  );

  const handleSearchSubmit = useCallback(() => {
    if (searchResults.length > 0) {
      selectAddress(searchResults[0]);
      return;
    }
    searchAddress(address);
  }, [address, searchAddress, searchResults, selectAddress]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (address.length > 2 && address !== selectedAddress) {
        searchAddress(address);
      } else if (address.length === 0) {
        setSearchResults([]);
      }
    }, 600);

    return () => clearTimeout(debounceTimer);
  }, [address, selectedAddress, searchAddress]);

  return {
    address,
    setAddress,
    selectedAddress,
    coordinates,
    searchResults,
    isSearching,
    selectAddress,
    handleSearchSubmit,
  };
}
