// Home stays a single small system. The first enemy, one hop out, starts the ramp.
(function () {
  var biomeSets = [
    ["earth", "desert", "tropical"],
    ["desert", "lava"],
    ["earth", "tropical"],
    ["lava", "metal", "desert"],
    ["earth", "desert", "metal"],
    ["tropical", "earth", "lava"],
  ];
  var radii = [
    [450, 550],
    [500, 600],
    [400, 520],
    [480, 600],
    [420, 540],
    [460, 580],
  ];

  var planet = function (position, velocity, biomes, radius) {
    return {
      starting_planet: true,
      mass: 50000,
      Thrust: [0, 0],
      Radius: radius,
      Height: [20, 25],
      Water: [20, 45],
      Temp: [0, 100],
      MetalDensity: [40, 65],
      MetalClusters: [0, 49],
      BiomeScale: [100, 100],
      Position: position,
      Velocity: velocity,
      Biomes: biomes,
    };
  };

  var layout = function (count, turn) {
    var bodies = [];
    var orbit = 32000 + count * 7000;
    var step = (Math.PI * 2) / count;
    var spin = turn * 0.35;
    var i;
    for (i = 0; i < count; i++) {
      var angle = step * i + spin;
      bodies.push(
        planet(
          [
            Math.round(Math.cos(angle) * orbit),
            Math.round(Math.sin(angle) * orbit),
          ],
          [
            Math.round(-Math.sin(angle) * 90),
            Math.round(Math.cos(angle) * 90),
          ],
          biomeSets[(i + turn) % biomeSets.length],
          radii[(i + turn) % radii.length]
        )
      );
    }
    return { Planets: bodies };
  };

  var systemsForPlanetCount = function (count) {
    return [layout(count, 0), layout(count, 1)];
  };

  var rampGroups = function (first) {
    var groups = [];
    var step;
    for (step = 0; step < 4; step++) {
      var players = first + step;
      var count = 2 + step;
      groups.push({
        Players: [players, players],
        Systems: systemsForPlanetCount(count),
      });
    }
    groups.push({
      Players: [first + 4, 100],
      Systems: systemsForPlanetCount(6),
    });
    return groups;
  };

  var patchList = function (templates) {
    var home = null;
    _.forEach(templates, function (group) {
      if (!home && group && group.Players && group.Players[0] === 0) {
        home = {
          Players: [0, 0],
          Systems: group.Systems,
        };
      }
    });
    var next = [];
    if (home) {
      next.push(home);
    }
    // Distance 1 is the first battle: 2 planets, then 3, 4, 5, and 6.
    next = next.concat(rampGroups(1));
    templates.length = 0;
    _.forEach(next, function (group) {
      templates.push(group);
    });
    return next.length - (home ? 1 : 0);
  };

  var loader = typeof requireGW === "function" ? requireGW : require;
  var paths = [
    "main/game/galactic_war/shared/js/systems/titans-normal",
    "main/game/galactic_war/shared/js/systems/titans-easy",
  ];

  loader(["shared/gw_common"], function (GW) {
    if (GW && GW.balance) {
      GW.balance.initialCardSlots = 40;
    }
  });

  _.forEach(paths, function (path) {
    loader(
      [path],
      function (templates) {
        var replaced = patchList(templates);
        console.log(
          "Hardness templates: " + path + " ramp groups " + replaced
        );
      },
      function (error) {
        console.error("Hardness failed to load " + path, error);
      }
    );
  });
})();
