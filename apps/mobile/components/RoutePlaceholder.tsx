import { StyleSheet, Text, View } from "react-native";

type RoutePlaceholderProps = {
  title: string;
};

export default function RoutePlaceholder({ title }: RoutePlaceholderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
});
