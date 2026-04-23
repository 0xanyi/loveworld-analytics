<script lang="ts">
  import "../app.css";
  let { children } = $props();
</script>

<!-- Page-level wrapper. Individual routes own their backgrounds so cover
     layouts (login) can break the margins safely. -->
<div class="min-h-screen bg-paper text-ink">
  {@render children()}
</div>
